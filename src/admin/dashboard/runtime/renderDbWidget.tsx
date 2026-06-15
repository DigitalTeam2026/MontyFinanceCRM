// Renders a persisted dashboard_widget row using the shared dashboard engine.
//
// This is the bridge that makes dashboards DATABASE-DRIVEN: a widget's
// data_source_type + query_definition + visual_config (stored in the DB) decide
// what renders, with zero hardcoded widget definitions.

import type { JSX } from 'react';
import type { DashboardWidget } from '../../../types/dashboard';
import { renderPreset, CustomKpi, CustomChart, type WidgetCtx } from '../../admindashboard/widgets';
import type { WidgetConfig } from '../../admindashboard/entityMeta';
import { Card, EmptyState } from '../../../app/pages/dashboard/widgets';

export function renderDbWidget(w: DashboardWidget, ctx: WidgetCtx): JSX.Element {
  const ds = w.data_source_type ?? 'entity';

  if (ds === 'preset') {
    return renderPreset(w.query_definition?.preset ?? '', ctx);
  }

  if (ds === 'entity') {
    const qd = w.query_definition ?? {};
    const vc = w.visual_config ?? {};
    if (w.widget_type === 'kpi' || qd.measure) {
      const cfg: WidgetConfig = {
        kind: 'kpi',
        entity: qd.entity ?? 'opportunities',
        measure: qd.measure === 'sum' ? 'sum' : 'count',
        field: qd.field,
        status: qd.status,
        label: vc.title ?? w.title,
      };
      return <CustomKpi ctx={{ ...ctx, config: cfg }} />;
    }
    const cfg: WidgetConfig = {
      kind: 'chart',
      entity: qd.entity ?? 'opportunities',
      dimension: qd.dimension ?? 'state_code',
      chartType: vc.chartType === 'bars' ? 'bars' : 'donut',
      status: qd.status,
      title: vc.title ?? w.title,
    };
    return <CustomChart ctx={{ ...ctx, config: cfg }} />;
  }

  if (ds === 'sql') {
    // SQL widget runtime rendering is wired in the SQL-editor iteration; until a
    // result mapping is configured, show a clear placeholder rather than failing.
    return (
      <Card title={w.title} subtitle={w.subtitle ?? 'Custom SQL'}>
        <EmptyState message="Configure this SQL widget's chart mapping to display results." />
      </Card>
    );
  }

  return <Card title={w.title}><EmptyState message="Unsupported widget type." /></Card>;
}
