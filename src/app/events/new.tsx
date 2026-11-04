import { Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import { useGoBack } from '@/features/common/useGoBack';
import { EventDefinitionForm } from '@/features/definitions/EventDefinitionForm';
import { EventDefinitionRepository } from '@/repositories';
import { spacing } from '@/theme';

export default function NewEventScreen() {
  const goBack = useGoBack();
  const { db } = useReadyDatabase();

  return (
    <Screen
      scroll
      contentStyle={{ paddingTop: spacing.md }}
      header={<Header title="新建事件" onBack={goBack} />}
    >
      <EventDefinitionForm
        initial={null}
        submitLabel="创建"
        onSubmit={async (draft) => {
          await new EventDefinitionRepository(db).create(draft);
          goBack();
        }}
      />
    </Screen>
  );
}
