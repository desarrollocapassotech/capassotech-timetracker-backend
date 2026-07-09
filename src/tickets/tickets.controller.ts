import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TicketsService } from './tickets.service';
import type { CreateTicketDto, CreateTicketMessageDto } from './tickets.dto';

@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('tickets')
  async createTicket(@Body() body: CreateTicketDto, @Req() req: Request) {
    const authHeader = req.headers.authorization;
    const authToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    return this.ticketsService.createTicket(body, authToken);
  }

  @Get('tickets/track/:codigo')
  findByCode(@Param('codigo') codigo: string) {
    return this.ticketsService.findByCode(codigo);
  }

  @Post('tickets/track/:codigo/messages')
  createMessageAsClient(
    @Param('codigo') codigo: string,
    @Body() body: CreateTicketMessageDto,
  ) {
    return this.ticketsService.createMessageAsClient(codigo, body);
  }

  @Get('ticket-client-profiles/:email')
  async findClientProfile(@Param('email') email: string) {
    return this.ticketsService.findClientProfileByEmail(decodeURIComponent(email));
  }
}
