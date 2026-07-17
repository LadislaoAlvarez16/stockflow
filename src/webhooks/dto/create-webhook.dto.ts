import {
  IsUrl,
  IsEnum,
  IsArray,
  ArrayMinSize,
  IsNotEmpty,
} from 'class-validator';
import { WebhookEventType } from '@prisma/client';

export class CreateWebhookDto {
  @IsUrl({}, { message: 'La URL proporcionada no es válida' })
  @IsNotEmpty()
  url: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un evento' })
  @IsEnum(WebhookEventType, {
    each: true,
    message: 'Evento de webhook no válido',
  })
  events: WebhookEventType[];
}
