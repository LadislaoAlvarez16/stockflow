import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una acción de auditoría sin bloquear la ejecución.
   * Promesa desconectada (Fire and forget) para no enlentecer los flujos de negocio.
   */
  log(data: {
    userId: string;
    action: string;
    entity?: string;
    entityId?: string;
    metadata?: any;
  }) {
    this.prisma.auditLog
      .create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          metadata: data.metadata || {},
        },
      })
      .catch((err) => {
        this.logger.error(
          `Error escribiendo audit log para ${data.action}`,
          err,
        );
      });
  }

  async getLogs(query: {
    userId?: string;
    entity?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
    take?: number;
  }) {
    const take = query.take || 50;

    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.entity) where.entity = query.entity;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      take,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const hasNextPage = logs.length === take;
    const nextCursor = hasNextPage ? logs[logs.length - 1].id : null;

    return { data: logs, nextCursor };
  }
}
