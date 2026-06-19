// TEMPORAL: remover o proteger con flag de entorno antes de producción
import { Controller, Post, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { AlertsCronService } from '../../alerts/alerts.cron';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('debug/cron')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DebugController {
  constructor(private readonly alertsCronService: AlertsCronService) {}

  @Post(':name')
  async runCron(@Param('name') name: string) {
    switch (name) {
      case 'check-stock-alerts':
        await this.alertsCronService.checkStockAlerts();
        break;
      case 'resolve-stale-alerts':
        await this.alertsCronService.resolveStaleAlerts();
        break;
      case 'daily-report':
        await this.alertsCronService.handleDailyReport();
        break;
      default:
        throw new BadRequestException(`Cron job '${name}' no reconocido.`);
    }

    return { success: true, executed: name };
  }
}
