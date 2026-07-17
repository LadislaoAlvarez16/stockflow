// TEMPORAL: remover o proteger con flag de entorno antes de producción
import {
  Controller,
  Post,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AlertsCronService } from '../../alerts/alerts.cron';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('debug/cron')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DebugController {
  constructor() {}

  @Post(':name')
  async runCron(@Param('name') name: string) {
    return {
      success: false,
      message: 'Cron functionality disabled in Phase 3',
    };
  }
}
