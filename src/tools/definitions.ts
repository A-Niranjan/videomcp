/**
 * Tool definitions for FFmpeg operations
 * Defines the available tools and their input schemas
 */
export const toolDefinitions = [
  {
    name: "get_video_info",
    description: "Get detailed information about a video file",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the video file"
        }
      },
      required: ["filePath"]
    }
  },
  {
    name: "convert_video",
    description: "Convert a video file to a different format",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        },
        options: {
          type: "string",
          description: "Additional FFmpeg options (optional)"
        }
      },
      required: ["inputPath", "outputPath"]
    }
  },
  {
    name: "extract_audio",
    description: "Extract audio from a video file",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        outputPath: {
          type: "string",
          description: "Path for the output audio file"
        },
        format: {
          type: "string",
          description: "Audio format (mp3, aac, etc.)"
        }
      },
      required: ["inputPath", "outputPath", "format"]
    }
  },
  {
    name: "create_video_from_images",
    description: "Create a video from a sequence of images",
    inputSchema: {
      type: "object",
      properties: {
        inputPattern: {
          type: "string",
          description: "Pattern for input images (e.g., 'img%03d.jpg' or 'folder/*.png')"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        },
        framerate: {
          type: "number",
          description: "Frames per second (default: 25)"
        },
        codec: {
          type: "string",
          description: "Video codec to use (default: libx264)"
        },
        pixelFormat: {
          type: "string",
          description: "Pixel format (default: yuv420p)"
        },
        extraOptions: {
          type: "string",
          description: "Additional FFmpeg options"
        }
      },
      required: ["inputPattern", "outputPath"]
    }
  },
  {
    name: "trim_video",
    description: "Trim a video to a specific duration",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        },
        startTime: {
          type: "string",
          description: "Start time (format: HH:MM:SS.mmm or seconds)"
        },
        duration: {
          type: "string",
          description: "Duration (format: HH:MM:SS.mmm or seconds)"
        },
        endTime: {
          type: "string",
          description: "End time (format: HH:MM:SS.mmm or seconds)"
        }
      },
      required: ["inputPath", "outputPath"]
    }
  },
  {
    name: "add_watermark",
    description: "Add a watermark to a video",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        watermarkPath: {
          type: "string",
          description: "Path to the watermark image"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        },
        position: {
          type: "string",
          description: "Position of watermark (topleft, topright, bottomleft, bottomright, center)"
        },
        opacity: {
          type: "number",
          description: "Opacity of watermark (0.0-1.0)"
        }
      },
      required: ["inputPath", "watermarkPath", "outputPath"]
    }
  },
  {
    name: "trim_audio",
    description: "Trim an audio file to a specific duration",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input audio file"
        },
        outputPath: {
          type: "string",
          description: "Path for the output audio file"
        },
        startTime: {
          type: "string",
          description: "Start time (format: HH:MM:SS.mmm or seconds)"
        },
        duration: {
          type: "string",
          description: "Duration (format: HH:MM:SS.mmm or seconds)"
        },
        endTime: {
          type: "string",
          description: "End time (format: HH:MM:SS.mmm or seconds)"
        },
        format: {
          type: "string",
          description: "Audio format for output (mp3, aac, etc.)"
        }
      },
      required: ["inputPath", "outputPath"]
    }
  },
  {
    name: "extract_frames",
    description: "Extract frames from a video as sequential image files",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        outputDir: {
          type: "string",
          description: "Directory to save the extracted frames (default: 'output')"
        },
        frameRate: {
          type: "string",
          description: "Frame extraction rate (e.g., '1' for every frame, '0.5' for every 2nd frame, '1/30' for 1 frame per 30 seconds)"
        },
        format: {
          type: "string",
          description: "Output image format (jpg, png, etc., default: jpg)"
        },
        quality: {
          type: "number",
          description: "Image quality for jpg format (1-100, default: 95)"
        },
        startTime: {
          type: "string",
          description: "Start time to begin extraction (format: HH:MM:SS.mmm or seconds)"
        },
        duration: {
          type: "string",
          description: "Duration to extract frames (format: HH:MM:SS.mmm or seconds)"
        }
      },
      required: ["inputPath"]
    }
  },
  {
    name: "split_video",
    description: "Split a video into segments of specified duration",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        segmentDuration: {
          type: "number",
          description: "Duration of each segment in seconds"
        },
        outputPattern: {
          type: "string",
          description: "Output pattern for segments (e.g., 'segment_%03d.mp4')"
        }
      },
      required: ["inputPath", "segmentDuration", "outputPattern"]
    }
  },
  {
    name: "fade_video",
    description: "Apply fade-in and fade-out effects to a video",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        fadeInDuration: {
          type: "number",
          description: "Fade-in duration in seconds"
        },
        fadeOutDuration: {
          type: "number",
          description: "Fade-out duration in seconds"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "fadeInDuration", "fadeOutDuration", "outputPath"]
    }
  },
  {
    name: "concatenate_videos",
    description: "Concatenate multiple videos into one",
    inputSchema: {
      type: "object",
      properties: {
        inputPaths: {
          type: "array",
          items: { type: "string" },
          description: "List of paths to input video files"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPaths", "outputPath"]
    }
  },
  {
    name: "merge_audio_video",
    description: "Merge an audio track with a video",
    inputSchema: {
      type: "object",
      properties: {
        videoPath: {
          type: "string",
          description: "Path to the video file"
        },
        audioPath: {
          type: "string",
          description: "Path to the audio file"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["videoPath", "audioPath", "outputPath"]
    }
  },
  {
    name: "replace_audio_track",
    description: "Replace the audio track in a video",
    inputSchema: {
      type: "object",
      properties: {
        inputVideoPath: {
          type: "string",
          description: "Path to the input video file"
        },
        inputAudioPath: {
          type: "string",
          description: "Path to the input audio file"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputVideoPath", "inputAudioPath", "outputPath"]
    }
  },
  {
    name: "overlay_image",
    description: "Overlay an image on a video (e.g., watermark)",
    inputSchema: {
      type: "object",
      properties: {
        inputVideoPath: {
          type: "string",
          description: "Path to the input video file"
        },
        inputImagePath: {
          type: "string",
          description: "Path to the input image file"
        },
        position: {
          type: "string",
          description: "Position of overlay (topleft, topright, bottomleft, bottomright, center)"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputVideoPath", "inputImagePath", "position", "outputPath"]
    }
  },
  {
    name: "transform_video",
    description: "Apply transformations to a video (crop, scale, rotate, flip, transpose, pad)",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        transformation: {
          type: "string",
          description: "Type of transformation (crop, scale, rotate, flip, transpose, pad)"
        },
        params: {
          type: "object",
          description: "Parameters for the transformation (depends on the type)"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "transformation", "params", "outputPath"]
    }
  },
  {
    name: "apply_color_curves",
    description: "Apply color curves to a video",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        redCurve: {
          type: "string",
          description: "Red curve adjustment (e.g., '0/0 0.5/0.6 1/1')"
        },
        greenCurve: {
          type: "string",
          description: "Green curve adjustment"
        },
        blueCurve: {
          type: "string",
          description: "Blue curve adjustment"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "redCurve", "greenCurve", "blueCurve", "outputPath"]
    }
  },
  {
    name: "set_video_fps",
    description: "Set the frame rate of a video",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        fps: {
          type: "number",
          description: "Frames per second"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "fps", "outputPath"]
    }
  },
  {
    name: "add_video_noise",
    description: "Add noise to a video",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        noiseStrength: {
          type: "number",
          description: "Strength of the noise"
        },
        noiseFlags: {
          type: "string",
          description: "Noise flags (e.g., 'u' for uniform)"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "noiseStrength", "noiseFlags", "outputPath"]
    }
  },
  {
    name: "apply_overlay",
    description: "Apply an overlay to a video with opacity",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        overlayPath: {
          type: "string",
          description: "Path to the overlay file (video or image)"
        },
        position: {
          type: "string",
          description: "Position of overlay (topleft, topright, bottomleft, bottomright, center)"
        },
        opacity: {
          type: "number",
          description: "Opacity of overlay (0.0 to 1.0)"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "overlayPath", "position", "opacity", "outputPath"]
    }
  },
  {
    name: "apply_filter_template",
    description: "Apply a filter template to a video",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        templateName: {
          type: "string",
          description: "Name of the filter template"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "templateName", "outputPath"]
    }
  },
  {
    name: "list_filter_templates",
    description: "List available filter templates",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "remove_segment",
    description: "Remove a specific segment from a video and merge the remaining parts",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input video file"
        },
        startTime: {
          type: "string",
          description: "Start time of the segment to remove (format: HH:MM:SS.mmm or seconds)"
        },
        endTime: {
          type: "string",
          description: "End time of the segment to remove (format: HH:MM:SS.mmm or seconds)"
        },
        outputPath: {
          type: "string",
          description: "Path for the output video file"
        }
      },
      required: ["inputPath", "startTime", "endTime", "outputPath"]
    }
  }
];