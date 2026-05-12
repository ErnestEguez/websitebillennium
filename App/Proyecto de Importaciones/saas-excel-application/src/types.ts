export type Profile = {
  id: string;
  company_id: string;
  full_name: string;
  role: 'SUPERADMIN' | 'ADMIN_EMPRESA' | 'USUARIO';
};

export type Company = {
  id: string;
  name: string;
  ruc: string;
  plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  status: 'active' | 'inactive';
};

export type Product = {
  id: string;
  company_id: string;
  code: string;
  description: string;
  base_cost: number;
  tariff_id: string;
};

export type Tariff = {
  id: string;
  code: string; // Partida arancelaria
  description: string;
  advalorem: number;
  fodinfa: number;
  ice: number;
  iva: number;
};

export type Importation = {
  id: string;
  company_id: string;
  number: string;
  provider: string;
  date: string;
  fob_total: number;
  freight: number;
  insurance: number;
  other_costs: number;
  cif_total: number;
  status: 'draft' | 'completed';
};

export type ImportationDetail = {
  id: string;
  importation_id: string;
  product_id: string;
  quantity: number;
  unit_fob: number;
  weight_fob_pct: number;
  cif_item: number;
  advalorem_item: number;
  fodinfa_item: number;
  iva_item: number;
  total_cost_item: number;
  unit_cost_item: number;
};
