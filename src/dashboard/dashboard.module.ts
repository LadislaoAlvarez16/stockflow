import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
