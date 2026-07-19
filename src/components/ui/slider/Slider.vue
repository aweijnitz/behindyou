<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    modelValue?: number[]
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    class?: HTMLAttributes['class']
    ariaLabel?: string
  }>(),
  { modelValue: () => [0], min: 0, max: 100, step: 1, ariaLabel: 'Video position' },
)

const emit = defineEmits<{ 'update:modelValue': [value: number[]] }>()
</script>

<template>
  <SliderRoot
    :model-value="props.modelValue"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :disabled="props.disabled"
    :class="cn('relative flex w-full touch-none select-none items-center', props.class)"
    @update:model-value="(value) => emit('update:modelValue', value ?? [0])"
  >
    <SliderTrack class="relative h-2 w-full grow overflow-hidden rounded-full bg-white/25">
      <SliderRange class="absolute h-full bg-white" />
    </SliderTrack>
    <SliderThumb
      :aria-label="props.ariaLabel"
      class="block size-6 rounded-full border-2 border-black bg-white shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
