import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('movements/recent')
  async getRecentMovements() {
    return this.dashboardService.getRecentMovements();
  }

  @Get('low-stock')
  async getLowStock() {
    return this.dashboardService.getLowStock();
  }
}
