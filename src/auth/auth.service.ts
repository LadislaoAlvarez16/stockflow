import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash' | 'refreshTokenHash'>;
};

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private async hashData(data: string) {
    return bcrypt.hash(data, 10);
  }

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('JWT_EXPIRATION') || '15m') as "15m",
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION') || '7d') as "7d",
    });

    const hash = await this.hashData(refreshToken);
    await this.usersService.updateRefreshTokenHash(user.id, hash);

    const { passwordHash: _ph, refreshTokenHash: _rth, ...userWithoutPasswordAndHash } = user;

    return {
      accessToken,
      refreshToken,
      user: userWithoutPasswordAndHash,
    };
  }

  async refresh(refreshToken: string): Promise<LoginResponse> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET') || 'change-this-in-production',
      });
    } catch (e) {
      throw new UnauthorizedException('Access denied');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Access denied');
    }

    const newPayload = { email: user.email, sub: user.id, role: user.role };

    const newAccessToken = this.jwtService.sign(newPayload, {
      expiresIn: (this.configService.get<string>('JWT_EXPIRATION') || '15m') as "15m",
    });
    const newRefreshToken = this.jwtService.sign(newPayload, {
      expiresIn: (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION') || '7d') as "7d",
    });

    const hash = await this.hashData(newRefreshToken);
    await this.usersService.updateRefreshTokenHash(user.id, hash);

    const { passwordHash: _ph, refreshTokenHash: _rth, ...userWithoutPasswordAndHash } = user;

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userWithoutPasswordAndHash,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshTokenHash(userId, null);
  }
}
