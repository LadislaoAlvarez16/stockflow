import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { GetAlertsFilterDto } from './dto/get-alerts-filter.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  findAll(@Query() filters: GetAlertsFilterDto) {
    return this.alertsService.findAll(filters);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id/acknowledge')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  acknowledge(@Param('id') id: string) {
    return this.alertsService.acknowledge(id);
  }

  @Patch(':id/resolve')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  resolve(@Param('id') id: string, @Request() req: any) {
    // Assuming the JWT guard populates req.user.id
    return this.alertsService.resolve(id, req.user.id);
  }
}
