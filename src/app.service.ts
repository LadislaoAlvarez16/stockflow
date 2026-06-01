import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  async onModuleInit() {
    // Simulamos la respuesta de la DB temporalmente para el entregable del MVP Base
    this.logger.log('🚀 Conexión a PostgreSQL (Simulada) establecida correctamente.');
  }

  getHello(): string {
    return 'StockFlow API running';
  }
}
