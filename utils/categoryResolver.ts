import { CategoryDef } from '../services/types';
import { CategoryConfig } from '../constants/theme';

export interface ResolvedCategory {
  name: string;
  color: string;
  icon: string;
}

export function resolveCategory(id: string, customCats: CategoryDef[] = []): ResolvedCategory {
  const def = CategoryConfig[id];
  if (def) return { name: def.label, color: def.color, icon: def.icon };
  const custom = customCats.find((c) => c.id === id);
  if (custom) return { name: custom.name, color: custom.color, icon: custom.icon || 'category' };
  return { name: id, color: '#555555', icon: 'category' };
}
