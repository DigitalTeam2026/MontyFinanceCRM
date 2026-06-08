export type AppModule = string;

export type AppEntity = string;

// Maps AppEntity key (e.g. "accounts") -> logical name (e.g. "account")
// Also used in reverse: logical name -> AppEntity key via LOGICAL_NAME_TO_ENTITY
export const ENTITY_LOGICAL_NAME: Record<string, string> = {
  accounts:       'account',
  contacts:       'contact',
  leads:          'lead',
  opportunities:  'opportunity',
  tickets:        'ticket',
  product_family: 'product_family',
  product:        'product',
};

// Maps logical name (e.g. "account") -> AppEntity key (e.g. "accounts")
// Dynamic entities use their logical_name directly as the entity key too.
export const LOGICAL_NAME_TO_ENTITY: Record<string, string> = {
  account:        'accounts',
  contact:        'contacts',
  lead:           'leads',
  opportunity:    'opportunities',
  ticket:         'tickets',
  product_family: 'product_family',
  product:        'product',
};

export const ENTITY_DEFINITION_ID: Record<string, string> = {
  accounts:       'e8c85d9b-2883-416e-8b49-1e83e641c530',
  contacts:       'bbb2b0af-2d11-46dc-9316-52106b816825',
  leads:          '2892cad3-04be-47c2-8de0-cc16509e1fcf',
  opportunities:  'e9482035-8715-40fa-a9d3-794c5b963c95',
  tickets:        '4a5cfe79-23d5-49b2-91ec-357b1469d00c',
  product_family: '419cbc86-dcf8-47a3-ace8-2662da11b22c',
  product:        'd1a4b318-4987-4c58-b583-33434042a54d',
};

export interface AppRoute {
  module: AppModule;
  entity: AppEntity;
}
