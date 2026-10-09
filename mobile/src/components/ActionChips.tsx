import { ScrollView } from 'react-native';
import { LEARN_ACTIONS, type LearnActionId } from '@curiox/shared';
import { Chip } from './ui';

const ICON: Record<LearnActionId, string> = {
  simplify: '🪶',
  go_deeper: '🔬',
  real_world_example: '🌍',
  challenge_me: '🎯',
  compare_perspectives: '⚖️',
};

export default function ActionChips({ disabled, onAction, onQuiz }: { disabled?: boolean; onAction: (id: LearnActionId) => void; onQuiz: () => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityLabel="Learn actions">
      {LEARN_ACTIONS.map((a) => (
        <Chip key={a.id} label={`${ICON[a.id]} ${a.label}`} disabled={disabled} onPress={() => onAction(a.id)} />
      ))}
      <Chip label="🧠 Quiz me" highlight disabled={disabled} onPress={onQuiz} />
    </ScrollView>
  );
}
