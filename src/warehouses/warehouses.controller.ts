import { Controller, Get, Post, Body, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createWarehouseDto: CreateWarehouseDto) {
    return this.warehousesService.create(createWarehouseDto);
  }

  @Get()
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(id, updateWarehouseDto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.deactivate(id);
  }
}

