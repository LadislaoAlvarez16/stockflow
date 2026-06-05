import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './common/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Database connection failed', error);
      throw new ServiceUnavailableException(
        'Database connection is currently unavailable',
      );
    }
  }

  getHello(): string {
    return 'Sistema StockFlow - Motor de Inventario Activo';
  }
}
