import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('audit-logs')
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async getLogs(
    @Query('userId') userId?: string,
    @Query('entity') entity?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.auditService.getLogs({
      userId,
      entity,
      dateFrom,
      dateTo,
      cursor,
    });
  }
}
