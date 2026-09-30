import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe, ValidationPipe } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from 'src/auth/Guards/jwt.guard';
import { RolesGuard } from 'src/auth/Guards/roles.guard';
import { SubscriptionGuard } from 'src/auth/Guards/subscription.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { RequestWithUser } from 'src/types/request-with-user';
import { CreateClientDTO, UpdateClientDTO } from 'src/types/clients.dto';

@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles('admin', 'user')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) { }

  @Post()
  create(@Body(ValidationPipe) createClientDto: CreateClientDTO, @Req() req: RequestWithUser) {
    return this.clientsService.create({
      ...createClientDto,
      user_id: req.user.id
    });
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.clientsService.findAll(req.user.id);
  }

  @Get(':client_id')
  findOne(@Param('client_id', ParseIntPipe) client_id: number, @Req() req: RequestWithUser) {
    return this.clientsService.findOne(client_id, req.user.id);
  }

  @Patch(':client_id')
  update(@Param('client_id', ParseIntPipe) client_id: number, @Body(ValidationPipe) updateClientDto: UpdateClientDTO, @Req() req: RequestWithUser) {
    return this.clientsService.update(client_id, req.user.id, updateClientDto);
  }

  @Delete(':client_id')
  remove(@Param('client_id', ParseIntPipe) client_id: number, @Req() req: RequestWithUser) {
    return this.clientsService.delete(client_id, req.user.id);
  }
}