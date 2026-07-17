import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('movements')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async importMovements(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo no proporcionado');
    }

    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('El archivo debe ser un CSV');
    }

    return this.importsService.processMovementsCSV(file, req.user.sub);
  }

  @Post('products')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async importProducts(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('El archivo debe ser un CSV');
    }
    return this.importsService.processProducts(file);
  }

  @Post('initial-stock')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async importInitialStock(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('El archivo debe ser un CSV');
    }
    const warehouseId = req.body.warehouseId;
    if (!warehouseId)
      throw new BadRequestException(
        'El depósito de destino (warehouseId) es requerido',
      );

    return this.importsService.processInitialStock(
      file,
      warehouseId,
      req.user.sub,
    );
  }
}
