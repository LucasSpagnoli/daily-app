import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

export class SetPasswordDTO {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsNotEmpty()
  @IsStrongPassword({
    minUppercase: 0,
    minSymbols: 0,
  })
  password!: string;
}
