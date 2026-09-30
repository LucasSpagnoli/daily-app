import { Body, Controller, Get, ParseIntPipe, Patch, Req, UseGuards, Param, ValidationPipe } from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { ClientsService } from 'src/clients/clients.service';
import { JwtAuthGuard } from 'src/auth/Guards/jwt.guard';
import { SubscriptionGuard } from 'src/auth/Guards/subscription.guard';
import type { RequestWithUser } from 'src/types/request-with-user';
import { UpdatePreferencesDto } from 'src/types/preferences.dto';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('preferences')
export class PreferencesController {
    constructor(
        private readonly preferenceService: PreferencesService,
        private readonly clientsService: ClientsService
    ) { }

    @Get()
    async findUser(@Req() req: RequestWithUser) {
        return this.preferenceService.getPreferencesById(req.user.id, 'user');
    }

    @Get(':client_id')
    async findClient(@Req() req: RequestWithUser, @Param('client_id', ParseIntPipe) client_id: number) {
        await this.clientsService.findOne(client_id, req.user.id);
        return this.preferenceService.getPreferencesById(client_id, 'client');
    }

    @Patch()
    async updateUserPreferences(@Body(ValidationPipe) dto: UpdatePreferencesDto, @Req() req: RequestWithUser) {
        return this.preferenceService.updatePreferences({ id: req.user.id, preferences: dto.preferences, role: 'user' });
    }

    @Patch(':client_id')
    async updateClientPreferences(@Body(ValidationPipe) dto: UpdatePreferencesDto, @Req() req: RequestWithUser, @Param('client_id', ParseIntPipe) client_id: number) {
        await this.clientsService.findOne(client_id, req.user.id);
        return this.preferenceService.updatePreferences({ id: client_id, preferences: dto.preferences, role: 'client' });
    }
}