import type { ReactNode } from 'react';
import { FiLock } from 'react-icons/fi';
import { useWorkspace } from '../../src/workspace/context';
import { PageHeader } from '../../src/workspace/ui';
import { planLabels, planRank } from '../../shared/workspace';
import type { Plan } from '../../shared/workspace';

/** Shows a section only when the workspace plan includes it; otherwise explains what the plan unlocks. */
export default function PlanGate({ need, title, children }: { need: Plan; title: string; children: ReactNode }) {
  const { data } = useWorkspace();
  if (!data) return null;
  const plan: Plan = data.plan ?? 'professional'; // databases without plans behave like the beta: everything on
  if (planRank[plan] >= planRank[need]) return <>{children}</>;
  return <>
    <PageHeader title={title} description={`Có từ gói ${planLabels[need]}.`} />
    <section className="mk-panel dk-locked" role="status"><FiLock aria-hidden="true" /><div><h2>{`Tính năng này có từ gói ${planLabels[need]}`}</h2><p>{`Không gian của bạn đang ở gói ${planLabels[plan]}. Liên hệ MaokiHouse để nâng cấp.`}</p></div></section>
  </>;
}
