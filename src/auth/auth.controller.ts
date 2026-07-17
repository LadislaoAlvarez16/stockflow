import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  NotFoundException,
} from '@nestjs/common';
import { AuthService, LoginResponse } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshTokenDto): Promise<LoginResponse> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.authService.logout(user.id);
  }

  @Get('me')
  async getProfile(
    @CurrentUser() user: JwtPayload,
  ): Promise<Omit<User, 'passwordHash' | 'refreshTokenHash'>> {
    const profile = await this.usersService.findById(user.id);
    if (!profile) {
      throw new NotFoundException('User not found');
    }
    return profile;
  }
}
