import type { Meta, StoryObj } from '@storybook/react';
import { PromptDiffView } from './prompt-diff-view';

const meta: Meta<typeof PromptDiffView> = {
  title: 'Prompts/PromptDiffView',
  component: PromptDiffView,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof PromptDiffView>;

export const SmallEdit: Story = {
  args: {
    before:
      'A bustling coffee shop interior during morning rush hour, warm sunlight, steam rising from cups.',
    after:
      'A quiet coffee shop interior during morning rush hour, golden sunlight, steam rising from cups.',
  },
};

export const FullReplacement: Story = {
  args: {
    before: 'Wide shot of a gritty alleyway at night, neon signs flickering.',
    after: 'Close-up of a worn detective badge on a polished wooden desk.',
  },
};

export const NoChange: Story = {
  args: {
    before: 'A serene mountain landscape at dawn.',
    after: 'A serene mountain landscape at dawn.',
  },
};

export const EmptyBefore: Story = {
  args: {
    before: '',
    after: 'A bustling coffee shop interior during morning rush hour.',
  },
};
