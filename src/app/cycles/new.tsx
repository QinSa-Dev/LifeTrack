import { useRouter } from 'expo-router';

import { Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import { CycleDefinitionForm } from '@/features/cycles/CycleDefinitionForm';
import { CycleDefinitionRepository } from '@/repositories';
import { spacing } from '@/theme';

export default function NewCycleDefinitionScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.md }}>
      <Header title="新建周期定义" onBack={() => router.back()} />
      <CycleDefinitionForm
        initial={null}
        submitLabel="创建"
        onSubmit={async (input) => {
          await new CycleDefinitionRepository(db).create(input);
          router.back();
        }}
      />
    </Screen>
  );
}
