<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

withDefaults(
  defineProps<{
    variant?: 'default' | 'secondary' | 'ghost' | 'destructive'
    size?: 'default' | 'lg' | 'icon'
    class?: HTMLAttributes['class']
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  { variant: 'default', size: 'default', type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="
      cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'bg-white text-black hover:bg-neutral-200',
        variant === 'secondary' && 'bg-neutral-800 text-white hover:bg-neutral-700',
        variant === 'ghost' && 'bg-transparent text-white hover:bg-white/15',
        variant === 'destructive' && 'bg-red-600 text-white hover:bg-red-500',
        size === 'default' && 'h-11 px-4 py-2',
        size === 'lg' && 'h-14 rounded-xl px-7 text-base',
        size === 'icon' && 'size-12 rounded-full',
        $props.class,
      )
    "
  >
    <slot />
  </button>
</template>
