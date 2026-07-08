import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { TicketEntity } from './ticket.entity';

@Entity({ name: 'ticket_attachments', schema: 'tracker' })
export class TicketAttachmentEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'ticket_id', type: 'text' })
  ticketId: string;

  @ManyToOne(() => TicketEntity, (ticket) => ticket.adjuntos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketEntity;

  @Column({ name: 'nombre_archivo', type: 'text' })
  nombreArchivo: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  tipo: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  creadoEn: Date;
}
