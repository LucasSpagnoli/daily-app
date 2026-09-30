import { Body, Controller, Get, HttpCode, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalGuard } from './Guards/local.guard';
import type { Request } from 'express';
import { JwtAuthGuard } from './Guards/jwt.guard';
import { AuthRole } from 'src/types/role';
import { CreateAdminDTO } from 'src/types/create-admin.dto';
import { SetPasswordDTO } from 'src/types/set-password.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('login')
    @HttpCode(200)
    @UseGuards(LocalGuard)
    async login(@Req() req: Request) {
        if (!req.user) {
            throw new Error('req.user not found');
        }
        const authData = await this.authService.signIn({
            userId: req.user.id,
            name: req.user.name,
            role: req.user.role as AuthRole,
        });
        return authData;
    }

    @Post('admin')
    async createAdmin(
        @Body(ValidationPipe) createAdminDTO: CreateAdminDTO,
    ) {
        return this.authService.createAdmin(createAdminDTO, createAdminDTO.adminSecret);
    }

    @Get('status')
    @UseGuards(JwtAuthGuard)
    status(@Req() req: Request) {
        return req.user;
    }

    /**
     * POST /auth/set-password
     * Rota pública — usada no primeiro acesso após pagamento
     * e no fluxo de "esqueci minha senha".
     */
    @Post('set-password')
    @HttpCode(200)
    async setPassword(@Body(ValidationPipe) dto: SetPasswordDTO) {
        await this.authService.setPassword(dto.token, dto.password);
        return { message: 'Senha definida com sucesso. Você já pode fazer login.' };
    }

    /**
     * POST /auth/resend-setup-link
     * Reenvio do e-mail de configuração de senha.
     * Retorna 200 mesmo se o e-mail não existir (evita enumeração).
     */
    @Post('resend-setup-link')
    @HttpCode(200)
    async resendSetupLink(@Body('email') email: string) {
        await this.authService.resendSetupLink(email);
        return { message: 'Se o e-mail estiver cadastrado, você receberá um novo link em instantes.' };
    }
}
