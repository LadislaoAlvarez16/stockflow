import { Module } from '@nestjs/common';
import { SerialNumbersService } from './serial-numbers.service';
import { SerialNumbersController } from './serial-numbers.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [SerialNumbersController],
  providers: [SerialNumbersService],
  exports: [SerialNumbersService],
})
export class SerialNumbersModule {}
