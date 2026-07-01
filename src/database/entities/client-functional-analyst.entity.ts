import { Entity, PrimaryColumn } from 'typeorm';

// tracker.client_functional_analysts <- Client.analistaFuncionalIds
@Entity({ name: 'client_functional_analysts', schema: 'tracker' })
export class ClientFunctionalAnalystEntity {
  @PrimaryColumn({ name: 'client_id', type: 'text' })
  clientId: string;

  @PrimaryColumn({ name: 'collaborator_id', type: 'text' })
  collaboratorId: string;
}
