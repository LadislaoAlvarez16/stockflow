import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'passwordHash' | 'refreshTokenHash'>> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const saltOrRounds = 10;
    const passwordHash = await bcrypt.hash(
      createUserDto.password,
      saltOrRounds,
    );

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        name: createUserDto.name,
        passwordHash,
        role: createUserDto.role || 'VIEWER',
      },
    });

    const { passwordHash: _ph, refreshTokenHash: _rth, ...result } = user;
    return result;
  }

  async findById(
    id: string,
  ): Promise<Omit<User, 'passwordHash' | 'refreshTokenHash'>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { passwordHash: _ph, refreshTokenHash: _rth, ...result } = user;
    return result;
  }

  async findFullById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async updateRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash: hash },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    const data = users.map((user) => {
      const { passwordHash: _ph, refreshTokenHash: _rth, ...result } = user;
      return result;
    });

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<Omit<User, 'passwordHash' | 'refreshTokenHash'>> {
    await this.findById(id);

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateUserDto.name && { name: updateUserDto.name }),
        ...(updateUserDto.role && { role: updateUserDto.role }),
        ...(updateUserDto.isActive !== undefined && { isActive: updateUserDto.isActive }),
      },
    });

    const { passwordHash: _ph, refreshTokenHash: _rth, ...result } = updatedUser;
    return result;
  }

  async deactivate(id: string): Promise<Omit<User, 'passwordHash' | 'refreshTokenHash'>> {
    await this.findById(id);

    const deactivatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    const { passwordHash: _ph, refreshTokenHash: _rth, ...result } = deactivatedUser;
    return result;
  }
}
