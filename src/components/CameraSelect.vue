<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  devices: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const selected = ref(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    selected.value = value
  },
)

watch(selected, (value) => {
  emit('update:modelValue', value)
})
</script>

<template>
  <label class="camera-select">
    <span class="label">Камера</span>
    <select v-model="selected" class="select">
      <option disabled value="">Выберите камеру</option>
      <option
        v-for="device in devices"
        :key="device.deviceId"
        :value="device.deviceId"
      >
        {{ device.label || `Камера ${device.deviceId.slice(0, 6)}` }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.camera-select {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
