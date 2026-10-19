import { useRouter } from 'expo-router';

import { Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import { EventDefinitionForm } from '@/features/definitions/EventDefinitionForm';
import { EventDefinitionRepository } from '@/repositories';
import { spacing } from '@/theme';

export default function NewEventScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.md }}>
      <Header title="新建事件" onBack={() => router.back()} />
      <EventDefinitionForm
        initial={null}
        submitLabel="创建"
        onSubmit={async (draft) => {
          await new EventDefinitionRepository(db).create(draft);
          router.back();
        }}
      />
    </Screen>
  );
}
