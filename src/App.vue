<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  Camera,
  CircleAlert,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SwitchCamera,
  Trash2,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { formatDuration, useBehindYouRecorder } from '@/composables/useBehindYouRecorder'

const recorder = useBehindYouRecorder()
const liveVideo = ref<HTMLVideoElement | null>(null)
const reviewVideo = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)

const sliderValue = computed(() => [currentTime.value])
const reviewDuration = computed(
  () => duration.value || (recorder.take.value?.durationMs ?? 0) / 1000,
)

watch(
  () => recorder.liveStream.value,
  async (stream) => {
    await nextTick()
    if (liveVideo.value) liveVideo.value.srcObject = stream
  },
  { flush: 'post' },
)

watch(
  () => recorder.take.value?.objectUrl,
  () => {
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
  },
)

onMounted(() => {
  if (recorder.privacyAccepted.value) void recorder.beginCamera()
})

function updateMetadata() {
  const video = reviewVideo.value
  if (video && Number.isFinite(video.duration)) duration.value = video.duration
}

function updatePlaybackTime() {
  const video = reviewVideo.value
  if (video) currentTime.value = video.currentTime
}

function seek(value: number[]) {
  const video = reviewVideo.value
  const nextTime = value[0] ?? 0
  currentTime.value = nextTime
  if (video) video.currentTime = nextTime
}

async function togglePlayback() {
  const video = reviewVideo.value
  if (!video) return
  if (video.paused) await video.play()
  else video.pause()
}

function deleteCurrentTake() {
  const video = reviewVideo.value
  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  recorder.deleteTake()
}
</script>

<template>
  <main class="app-shell">
    <section
      v-if="recorder.state.value === 'intro'"
      class="center-panel"
      aria-labelledby="intro-title"
    >
      <div class="intro-icon" aria-hidden="true"><ShieldCheck :size="38" /></div>
      <template v-if="!recorder.privacyAccepted.value">
        <p class="eyebrow">Private by design</p>
        <h1 id="intro-title">Check your hair, not your storage</h1>
        <p class="supporting-copy">
          Your silent video stays in temporary memory on this device. It is never saved, uploaded,
          or shared—and it disappears when you delete it, start over, or leave the app.
        </p>
        <Button
          size="lg"
          class="w-full"
          data-testid="accept-privacy"
          @click="recorder.acceptPrivacy"
        >
          <Camera :size="20" /> Open camera
        </Button>
      </template>
      <template v-else>
        <p class="eyebrow">Camera is off</p>
        <h1 id="intro-title">Ready for another check?</h1>
        <p class="supporting-copy">Nothing from your last session was kept.</p>
        <Button size="lg" class="w-full" data-testid="resume-camera" @click="recorder.beginCamera">
          <Camera :size="20" /> Start camera
        </Button>
      </template>
    </section>

    <section
      v-else-if="recorder.state.value === 'requesting-permission'"
      class="center-panel"
      aria-live="polite"
    >
      <div class="spinner" aria-hidden="true" />
      <h1>Opening camera…</h1>
      <p class="supporting-copy">If asked, allow camera access. The microphone is not used.</p>
    </section>

    <section v-else-if="recorder.state.value === 'error'" class="center-panel" role="alert">
      <div class="intro-icon error-icon" aria-hidden="true"><CircleAlert :size="38" /></div>
      <p class="eyebrow">Camera unavailable</p>
      <h1>We couldn’t start this check</h1>
      <p class="supporting-copy">{{ recorder.error.value?.message }}</p>
      <Button size="lg" class="w-full" data-testid="retry-camera" @click="recorder.retryCamera">
        <RotateCcw :size="20" /> Try again
      </Button>
    </section>

    <section
      v-else-if="['live', 'recording', 'switching-camera'].includes(recorder.state.value)"
      class="camera-stage"
      aria-label="Live camera"
    >
      <video
        ref="liveVideo"
        :class="['camera-video', { mirrored: recorder.cameraFacing.value === 'user' }]"
        autoplay
        muted
        playsinline
        aria-label="Live camera preview"
      />
      <div class="camera-vignette" aria-hidden="true" />
      <div class="top-status" aria-live="polite">
        <span v-if="recorder.cameraNotice.value" class="privacy-pill" role="status">
          {{ recorder.cameraNotice.value }}
        </span>
        <span v-else-if="recorder.state.value === 'recording'" class="recording-pill">
          <span class="recording-dot" /> REC {{ recorder.formattedElapsed.value }} / 1:00
        </span>
        <span v-else class="privacy-pill"><ShieldCheck :size="15" /> Stays on this device</span>
      </div>
      <div v-if="recorder.state.value === 'switching-camera'" class="switching-overlay">
        <div class="spinner" aria-hidden="true" />
        <p role="status">Switching camera…</p>
      </div>
      <div class="record-controls">
        <p class="record-hint">
          {{
            recorder.state.value === 'recording'
              ? 'Turn slowly from side to side'
              : recorder.state.value === 'switching-camera'
                ? 'Getting the other camera ready'
                : 'Frame your head, then tap record'
          }}
        </p>
        <div v-if="recorder.state.value !== 'switching-camera'" class="capture-control-row">
          <button
            v-if="recorder.state.value === 'live'"
            class="record-button"
            aria-label="Start recording"
            data-testid="record-button"
            @click="recorder.startRecording"
          >
            <span />
          </button>
          <button
            v-else
            class="record-button recording"
            aria-label="Stop recording"
            data-testid="stop-button"
            @click="recorder.stopRecording"
          >
            <span />
          </button>
          <Button
            v-if="recorder.state.value === 'live'"
            variant="secondary"
            size="icon"
            class="camera-switch-button"
            :aria-label="
              recorder.cameraFacing.value === 'user'
                ? 'Switch to rear camera'
                : 'Switch to front camera'
            "
            data-testid="switch-camera"
            @click="recorder.switchCamera"
          >
            <SwitchCamera :size="24" />
          </Button>
        </div>
      </div>
    </section>

    <section
      v-else-if="recorder.state.value === 'finalizing'"
      class="center-panel"
      aria-live="polite"
    >
      <div class="spinner" aria-hidden="true" />
      <h1>Preparing your check…</h1>
      <p class="supporting-copy">The video is staying right here in temporary memory.</p>
    </section>

    <section
      v-else-if="recorder.state.value === 'review' && recorder.take.value"
      class="review-stage"
    >
      <video
        ref="reviewVideo"
        :src="recorder.take.value.objectUrl"
        :class="['camera-video', { mirrored: recorder.take.value.cameraFacing === 'user' }]"
        playsinline
        preload="metadata"
        aria-label="Recorded hair check"
        @loadedmetadata="updateMetadata"
        @durationchange="updateMetadata"
        @timeupdate="updatePlaybackTime"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="isPlaying = false"
      />
      <div class="camera-vignette" aria-hidden="true" />
      <div class="top-status"><span class="review-pill">Review your hair</span></div>
      <div class="review-controls">
        <div class="timeline-row">
          <Button
            variant="secondary"
            size="icon"
            :aria-label="isPlaying ? 'Pause video' : 'Play video'"
            data-testid="play-pause"
            @click="togglePlayback"
          >
            <Pause v-if="isPlaying" :size="22" />
            <Play v-else :size="22" class="translate-x-px" />
          </Button>
          <div class="timeline-stack">
            <Slider
              :model-value="sliderValue"
              :min="0"
              :max="Math.max(reviewDuration, 0.01)"
              :step="0.01"
              aria-label="Video position"
              data-testid="timeline"
              @update:model-value="seek"
            />
            <div class="time-labels">
              <span>{{ formatDuration(currentTime * 1000) }}</span>
              <span>{{ formatDuration(reviewDuration * 1000) }}</span>
            </div>
          </div>
        </div>
        <div class="review-actions">
          <Button
            variant="destructive"
            size="lg"
            data-testid="delete-take"
            @click="deleteCurrentTake"
          >
            <Trash2 :size="20" /> Delete
          </Button>
          <Button size="lg" data-testid="new-take" @click="recorder.startNewTake">
            <RotateCcw :size="20" /> New take
          </Button>
        </div>
        <p class="delete-note">This take vanishes when you delete it or leave.</p>
      </div>
    </section>
  </main>
</template>
