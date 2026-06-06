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
  user: Omit<User, 'passwordHash'>;
};

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

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

    const { passwordHash, ...userWithoutPassword } = user;

    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: (this.configService.get<string>('JWT_EXPIRATION') || '15m') as "15m",
      }),
      refreshToken: this.jwtService.sign(payload, {
        expiresIn: (this.configService.get<string>('REFRESH_TOKEN_EXPIRATION') || '7d') as "7d",
      }),
      user: userWithoutPassword,
    };
  }
}
