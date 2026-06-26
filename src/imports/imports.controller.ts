import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

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
}
