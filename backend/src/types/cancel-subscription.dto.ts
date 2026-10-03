import { IsBoolean, IsNotEmpty } from 'class-validator';

export class CancelSubscriptionDTO {
  /**
   * Se true: apaga imediatamente os dados de clientes e preferências.
   * Se false: mantém os dados salvos por 60 dias antes da exclusão definitiva.
   */
  @IsNotEmpty()
  @IsBoolean()
  deleteDataImmediately!: boolean;
}
