<script lang="ts">
	/** Looping AV1 background video, layered behind page content.
	 *
	 * AV1-only: browsers without AV1 decode support (older Safari/iOS) simply
	 * never get a playable <source>, so the <video> element renders nothing
	 * and the CSS background already set on the parent shows through
	 * instead. No JS feature-detection needed — that's what <source> is for.
	 *
	 * Respects prefers-reduced-motion by never mounting the video at all. */
	let { src, opacity = 0.4 }: { src: string; opacity?: number } = $props();

	let reduceMotion = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion = mq.matches;
		const onChange = () => (reduceMotion = mq.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});
</script>

{#if !reduceMotion}
	<video
		class="bg-video"
		style:opacity
		autoplay
		muted
		loop
		playsinline
		disablepictureinpicture
		preload="auto"
		aria-hidden="true"
	>
		<source {src} type="video/mp4; codecs=av01.0.05M.08" />
	</video>
{/if}

<style>
	.bg-video {
		position: absolute;
		inset: 0;
		z-index: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}
</style>
