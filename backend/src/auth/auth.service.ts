import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from 'src/database/database.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDTO } from 'src/types/create-user.dto';
import { AuthRole } from 'src/types/role';
import { CreateAdminDTO } from 'src/types/create-admin.dto';
import { NotificationsService } from 'src/notifications/notifications.service';
import * as crypto from 'crypto';

type AuthInput = { email: string; password: string };
type SignInData = { userId: number; name: string; role: AuthRole };

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly databaseService: DatabaseService,
        private jwtService: JwtService,
        private readonly notifications: NotificationsService,
    ) { }

    async signIn(user: SignInData) {
        const tokenPayload = {
            sub: user.userId,
            name: user.name,
            role: user.role,
        };
        const accessToken = await this.jwtService.signAsync(tokenPayload);
        return { accessToken, name: user.name, userId: user.userId, role: user.role };
    }

    async createUser(createUserDTO: CreateUserDTO) {
        try {
            const userExists = await this.databaseService.user.findUnique({
                where: { email: createUserDTO.email },
            });

            if (userExists) {
                this.logger.warn(`Colisão de credenciais: e-mail já utilizado (${createUserDTO.email}).`);
                throw new ConflictException('Usuário já existente');
            }

            const hashedPassword = await bcrypt.hash(createUserDTO.password, 10);
            const newUser = await this.databaseService.user.create({
                data: { ...createUserDTO, password: hashedPassword, role: 'user' },
            });

            const { password, ...userWithoutPassword } = newUser;
            return { newUser: userWithoutPassword };
        } catch (error) {
            if (error instanceof ConflictException) throw error;

            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Erro ao persistir usuário (${createUserDTO.email}). Motivo: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException('Erro ao processar o registro.');
        }
    }

    async createAdmin(createAdminDTO: CreateAdminDTO, adminSecret: string) {
        const expectedSecret = process.env.ADMIN_SECRET;

        if (!expectedSecret || adminSecret !== expectedSecret) {
            this.logger.warn('Tentativa de criação de admin com secret inválido.');
            throw new ForbiddenException('Secret de administrador inválido.');
        }

        try {
            const userExists = await this.databaseService.user.findUnique({
                where: { email: createAdminDTO.email },
            });

            if (userExists) {
                throw new ConflictException('Usuário já existente');
            }

            const { adminSecret: _, ...adminData } = createAdminDTO;
            const hashedPassword = await bcrypt.hash(adminData.password, 10);
            const newAdmin = await this.databaseService.user.create({
                data: { ...adminData, password: hashedPassword, role: 'admin' },
            });

            const tokenPayload = { sub: newAdmin.id, name: newAdmin.name, role: 'admin' as AuthRole };
            const accessToken = await this.jwtService.signAsync(tokenPayload);

            const { password, ...adminWithoutPassword } = newAdmin;
            return { accessToken, admin: adminWithoutPassword };
        } catch (error) {
            if (error instanceof ConflictException || error instanceof ForbiddenException) throw error;

            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Erro ao criar admin (${createAdminDTO.email}). Motivo: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException('Erro ao criar administrador.');
        }
    }

    async validateUser(input: AuthInput) {
        try {
            const foundUser = await this.databaseService.user.findUnique({ where: { email: input.email } });

            if (!foundUser) {
                this.logger.warn(`Autenticação falhou: e-mail não encontrado (${input.email}).`);
                throw new UnauthorizedException('Usuário não encontrado');
            }

            if (!foundUser.password) {
                this.logger.warn(`Autenticação falhou: usuário ainda não definiu senha (${foundUser.id}).`);
                throw new UnauthorizedException('Senha ainda não cadastrada. Verifique seu e-mail para ativar sua conta.');
            }

            const isPassCorrect = await bcrypt.compare(input.password, foundUser.password);

            if (!isPassCorrect) {
                this.logger.warn(`Autenticação falhou: divergência criptográfica para o usuário (${foundUser.id}).`);
                throw new UnauthorizedException('Senha incorreta');
            }

            const { password, ...user } = foundUser;
            return user;
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;

            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Erro durante a validação de credenciais do e-mail (${input.email}). Motivo: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException('Contingência ao validar o usuário.');
        }
    }

    /**
     * Define a senha de um usuário via token de configuração.
     * Usado no fluxo pós-pagamento (primeiro acesso) e no "esqueci minha senha".
     */
    async setPassword(token: string, newPassword: string): Promise<void> {
        const setupToken = await this.databaseService.passwordSetupToken.findUnique({
            where: { token },
        });

        if (!setupToken) {
            throw new NotFoundException('Token de configuração não encontrado.');
        }

        if (setupToken.usedAt !== null) {
            throw new BadRequestException('Este link já foi utilizado.');
        }

        if (new Date() > setupToken.expiresAt) {
            throw new BadRequestException('Este link expirou. Solicite um novo na tela de login.');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await this.databaseService.$transaction([
            this.databaseService.user.update({
                where: { id: setupToken.userId },
                data: { password: hashedPassword, role: 'user' },
            }),
            this.databaseService.passwordSetupToken.update({
                where: { id: setupToken.id },
                data: { usedAt: new Date() },
            }),
        ]);

        this.logger.log(`Senha definida com sucesso para o usuário ID: ${setupToken.userId}`);
    }

    /**
     * Reenvio do link de definição de senha.
     * Gera um novo token (invalidando o anterior) e envia novo e-mail.
     */
    async resendSetupLink(email: string): Promise<void> {
        const user = await this.databaseService.user.findUnique({ where: { email } });

        // Retornar sucesso mesmo se o e-mail não existir (evita enumeração)
        if (!user) {
            this.logger.warn(`Reenvio solicitado para e-mail inexistente: ${email}`);
            return;
        }

        // Invalidar tokens anteriores
        await this.databaseService.passwordSetupToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        });

        const token = crypto.randomBytes(40).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        await this.databaseService.passwordSetupToken.create({
            data: { userId: user.id, token, expiresAt },
        });

        await this.notifications.sendPasswordResetEmail(user.email, user.name, token);
        this.logger.log(`Novo link de configuração enviado para: ${email}`);
    }
}
