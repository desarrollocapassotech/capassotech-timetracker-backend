import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { TicketEntity } from './ticket.entity';
import { TicketMessageAuthor } from '../../tickets/ticket.enums';

@Entity({ name: 'ticket_messages', schema: 'tracker' })
export class TicketMessageEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'ticket_id', type: 'text' })
  ticketId: string;

  @ManyToOne(() => TicketEntity, (ticket) => ticket.mensajes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketEntity;

  @Column({ type: 'enum', enum: TicketMessageAuthor, enumName: 'ticket_message_author' })
  autor: TicketMessageAuthor;

  @Column({ name: 'autor_nombre', type: 'text', nullable: true })
  autorNombre: string | null;

  @Column({ type: 'text' })
  mensaje: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  creadoEn: Date;
}
