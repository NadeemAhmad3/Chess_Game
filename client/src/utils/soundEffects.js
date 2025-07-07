/**
 * Sound effects utility using Web Audio API
 * This implementation generates sounds directly without loading files
 */

// Flag to track if sounds are enabled - set to true by default
let soundsEnabled = true;

// Audio context for Web Audio API
let audioContext = null;

// Initialize the audio context with better error handling
const initAudioContext = () => {
  // If we already have an audio context, check its state
  if (audioContext) {
    // If the context is in a bad state, try to fix it
    if (audioContext.state === 'suspended' || audioContext.state === 'interrupted') {
      console.log(`Audio context in ${audioContext.state} state, attempting to resume...`);
      try {
        // Try to resume the context
        audioContext.resume().then(() => {
          console.log('Audio context resumed successfully');
        }).catch(e => {
          console.log('Failed to resume audio context:', e);

          // If resume fails, try creating a new context
          try {
            console.log('Attempting to create a new audio context...');
            audioContext.close().catch(() => {});
            audioContext = null;
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
            console.log('New audio context created with state:', audioContext.state);
          } catch (newError) {
            console.log('Failed to create new audio context:', newError);
          }
        });
      } catch (e) {
        console.log('Error resuming audio context:', e);
      }
    }
    return audioContext;
  }

  try {
    // Create audio context
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    console.log('New audio context created with state:', audioContext.state);

    // Resume the audio context if it's suspended
    if (audioContext.state === 'suspended') {
      console.log('New audio context is suspended, attempting to resume...');
      audioContext.resume().then(() => {
        console.log('New audio context resumed successfully');
      }).catch(e => {
        console.log('Failed to resume new audio context:', e);
      });
    }

    return audioContext;
  } catch (e) {
    // If we can't create an audio context, disable sounds
    console.log('Failed to create audio context:', e);
    soundsEnabled = false;
    return null;
  }
};

// Global variables to track and stop any ongoing move sounds
let moveOscillators = [];
let moveGainNodes = [];

// Extremely simple move sound that is guaranteed to stop
const playMoveSound = () => {
  if (!soundsEnabled) return;

  // First, stop any existing move sounds
  stopAllMoveSounds();

  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    // Create a very simple oscillator
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 800; // Higher pitch for move

    // Create a gain node with a very simple envelope
    const gainNode = ctx.createGain();

    // Set initial gain to 0 (silent)
    gainNode.gain.value = 0;

    // Very quick attack
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);

    // Very quick decay
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);

    // Connect oscillator to gain node, and gain node to destination
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Start the oscillator
    oscillator.start(ctx.currentTime);

    // Stop the oscillator after a very short time
    oscillator.stop(ctx.currentTime + 0.04);

    // Store references to the oscillator and gain node
    moveOscillators.push(oscillator);
    moveGainNodes.push(gainNode);

    // Set a timeout to clean up resources
    setTimeout(() => {
      stopAllMoveSounds();
    }, 50);

    // Set another timeout as a failsafe
    setTimeout(() => {
      if (moveOscillators.length > 0 || moveGainNodes.length > 0) {
        console.log("Failsafe: Stopping lingering move sounds");
        stopAllMoveSounds();
      }
    }, 200);

  } catch (e) {
    console.log('Error playing move sound:', e);
    // Clean up any resources that might have been created
    stopAllMoveSounds();
  }
};

// Function to stop all move sounds
const stopAllMoveSounds = () => {
  try {
    // Disconnect and clear all oscillators
    moveOscillators.forEach(osc => {
      try {
        osc.disconnect();
        if (osc.stop) {
          try {
            osc.stop();
          } catch (e) {
            // Ignore errors when stopping
          }
        }
      } catch (e) {
        // Ignore errors when disconnecting
      }
    });

    // Disconnect and clear all gain nodes
    moveGainNodes.forEach(gain => {
      try {
        gain.disconnect();
      } catch (e) {
        // Ignore errors when disconnecting
      }
    });

    // Clear the arrays
    moveOscillators = [];
    moveGainNodes = [];

  } catch (e) {
    console.log('Error stopping move sounds:', e);
    // Reset the arrays as a last resort
    moveOscillators = [];
    moveGainNodes = [];
  }
};

// Global variables to track capture sound components
let captureOscillator = null;
let captureGainNode = null;

// Play a capture sound that works reliably without blocking the game
const playCaptureSound = () => {
  if (!soundsEnabled) return;

  // First, ensure any previous capture sound is stopped
  if (captureOscillator || captureGainNode) {
    try {
      if (captureOscillator) {
        captureOscillator.disconnect();
        if (captureOscillator.stop) {
          captureOscillator.stop();
        }
      }
      if (captureGainNode) {
        captureGainNode.disconnect();
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
    captureOscillator = null;
    captureGainNode = null;
  }

  try {
    // Use the shared audio context
    const ctx = initAudioContext();
    if (!ctx) return;

    // Create a simple oscillator for the main sound
    captureOscillator = ctx.createOscillator();
    captureOscillator.type = 'triangle';
    captureOscillator.frequency.value = 350;

    // Create a gain node with a simple envelope
    captureGainNode = ctx.createGain();
    captureGainNode.gain.value = 0;
    captureGainNode.gain.setValueAtTime(0, ctx.currentTime);
    captureGainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    captureGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);

    // Connect and start
    captureOscillator.connect(captureGainNode);
    captureGainNode.connect(ctx.destination);
    captureOscillator.start(ctx.currentTime);
    captureOscillator.stop(ctx.currentTime + 0.11);

    // Clean up after the sound is done
    setTimeout(() => {
      try {
        if (captureOscillator) {
          captureOscillator.disconnect();
        }
        if (captureGainNode) {
          captureGainNode.disconnect();
        }
        captureOscillator = null;
        captureGainNode = null;
      } catch (e) {
        // Ignore errors during cleanup
      }
    }, 150);
  } catch (e) {
    console.log('Error playing capture sound:', e);
    // Reset the variables in case of error
    captureOscillator = null;
    captureGainNode = null;
  }
};

// Play a chord sound for check
const playCheckSound = () => {
  if (!soundsEnabled) return;

  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    // Create oscillators for a chord (warning sound)
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - C major chord
    const oscillators = [];
    const gainNodes = [];

    // Create oscillators and gain nodes
    for (let i = 0; i < frequencies.length; i++) {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequencies[i], ctx.currentTime);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.00001, ctx.currentTime); // Start silent
      gainNode.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3); // Longer decay

      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Start oscillator with definite stop time
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.3);

      // Store for later cleanup
      oscillators.push(oscillator);
      gainNodes.push(gainNode);
    }

    // Clean up resources after the sound is definitely done
    setTimeout(() => {
      try {
        // Disconnect all oscillators and gain nodes
        for (let i = 0; i < oscillators.length; i++) {
          oscillators[i].disconnect();
          gainNodes[i].disconnect();
        }
      } catch (e) {
        // Ignore errors on cleanup
      }
    }, 350); // Wait a bit longer than the sound duration
  } catch (e) {
    console.log('Error playing check sound:', e);
  }
};

// Play a beep sound for low time
const playLowTimeSound = () => {
  if (!soundsEnabled) return;

  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    // Create oscillator for a beep sound
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // High pitch for urgency

    // Create gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.00001, ctx.currentTime); // Start silent
    gainNode.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01); // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.15); // Medium decay

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play sound with definite stop time
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);

    // Clean up resources after the sound is definitely done
    setTimeout(() => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch (e) {
        // Ignore errors on cleanup
      }
    }, 200); // Wait a bit longer than the sound duration
  } catch (e) {
    console.log('Error playing low time sound:', e);
  }
};

// Play a buzz sound for timeout
const playTimeoutSound = () => {
  if (!soundsEnabled) return;

  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    // Create oscillator for a buzz sound
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sawtooth'; // Harsh waveform for buzz
    oscillator.frequency.setValueAtTime(150, ctx.currentTime); // Low frequency for buzz

    // Create gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.00001, ctx.currentTime); // Start silent
    gainNode.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01); // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5); // Long decay

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play sound with definite stop time
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.5);

    // Clean up resources after the sound is definitely done
    setTimeout(() => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch (e) {
        // Ignore errors on cleanup
      }
    }, 600); // Wait a bit longer than the sound duration
  } catch (e) {
    console.log('Error playing timeout sound:', e);
  }
};

// Function to stop all sounds - simplified to avoid blocking the game
const stopAllSounds = () => {
  try {
    // Stop all move sounds
    stopAllMoveSounds();

    // Stop any capture sounds
    if (captureOscillator || captureGainNode) {
      try {
        if (captureOscillator) {
          captureOscillator.disconnect();
          if (captureOscillator.stop) {
            captureOscillator.stop();
          }
        }
        if (captureGainNode) {
          captureGainNode.disconnect();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      captureOscillator = null;
      captureGainNode = null;
    }

    // We don't close the audio context anymore as it can cause issues
    // Just log that sounds were stopped
    console.log('All sounds stopped');
  } catch (e) {
    console.log('Error stopping all sounds:', e);
  }
};

// Initialize sound effects
const initSounds = () => {
  // Ensure sounds are enabled by default
  soundsEnabled = true;

  // Stop any existing sounds
  stopAllSounds();

  // Initialize audio context
  initAudioContext();
};

// Functions to control sound state
const setSoundsEnabled = (enabled) => {
  soundsEnabled = enabled;

  // If sounds are disabled, stop all current sounds
  if (!enabled) {
    stopAllSounds();
  }
};

const getSoundsEnabled = () => {
  return soundsEnabled;
};

// Export functions
export {
  initSounds,
  playLowTimeSound,
  playTimeoutSound,
  playMoveSound,
  playCheckSound,
  playCaptureSound,
  setSoundsEnabled,
  getSoundsEnabled,
  stopAllSounds
};
