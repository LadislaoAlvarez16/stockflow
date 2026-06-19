import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';
import { AlertsModule } from '../../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [DebugController],
})
export class DebugModule {}
