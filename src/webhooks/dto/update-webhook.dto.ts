import {
  IsUrl,
  IsEnum,
  IsArray,
  ArrayMinSize,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { WebhookEventType } from '@prisma/client';

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({}, { message: 'La URL proporcionada no es válida' })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un evento' })
  @IsEnum(WebhookEventType, {
    each: true,
    message: 'Evento de webhook no válido',
  })
  events?: WebhookEventType[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
