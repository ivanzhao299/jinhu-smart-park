import type { ReactNode } from "react";

export interface PropertyFieldDescriptor<T> {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
}

export interface PropertyProjectedField {
  key: string;
  label: string;
  value: ReactNode;
}

export function projectPropertyRecord<T>(
  item: T,
  fields: readonly PropertyFieldDescriptor<T>[]
): PropertyProjectedField[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    value: field.render(item)
  }));
}
