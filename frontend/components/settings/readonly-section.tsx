import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReadonlyField {
  label: string;
  value: string;
}

interface Props {
  title: string;
  fields: ReadonlyField[];
}

export function ReadonlySection({ title, fields }: Props) {
  return (
    <Card className="border-slate-200 bg-slate-50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">🔒</span>
          <CardTitle className="text-base text-slate-500">{title}</CardTitle>
        </div>
        <p className="text-xs text-slate-400">
          Géré par variable d&apos;environnement — non modifiable via l&apos;interface
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-slate-400">{f.label}</dt>
              <dd className="text-sm font-mono text-slate-500">{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
