import { validatePath } from "../utils/file.js";
import { getVideoInfo, runFFmpegCommand } from "../utils/ffmpeg.js";
import { ensureDirectoryExists } from "../utils/file.js";
import { join } from "path";
import { existsSync, readdirSync, readFileSync, unlinkSync, renameSync, writeFileSync } from "fs";

function parseTimeToSeconds(timeStr: string | number): number {
  if (timeStr === undefined || timeStr === null) {
    throw new Error("Time input cannot be undefined or null.");
  }

  const time = String(timeStr).trim(); // Ensure it's a string and trim whitespace

  if (time === "") {
    throw new Error("Time string cannot be empty after trimming.");
  }

  if (time.includes(':')) {
    const parts = time.split(':');
    let totalSeconds = 0;
    if (parts.length === 3) { // HH:MM:SS.mmm or HH:MM:SS
      totalSeconds += parseInt(parts[0], 10) * 3600; // hours
      totalSeconds += parseInt(parts[1], 10) * 60;   // minutes
      totalSeconds += parseFloat(parts[2]);          // seconds
    } else if (parts.length === 2) { // MM:SS.mmm or MM:SS
      totalSeconds += parseInt(parts[0], 10) * 60;   // minutes
      totalSeconds += parseFloat(parts[1]);          // seconds
    } else {
      throw new Error(`Invalid time format: "${timeStr}". Expected HH:MM:SS.mmm, MM:SS.mmm, or a number of seconds.`);
    }
    if (isNaN(totalSeconds)) {
        throw new Error(`Invalid time string: "${timeStr}" resulted in NaN after parsing time components.`);
    }
    return totalSeconds;
  } else {
    const parsedSeconds = parseFloat(time);
    if (isNaN(parsedSeconds)) {
      throw new Error(`Invalid time format: "${timeStr}". Expected HH:MM:SS.mmm, MM:SS.mmm, or a number of seconds.`);
    }
    return parsedSeconds;
  }
}

/**
 * Handles all FFmpeg tool requests
 */
export async function handleToolCall(toolName: string, args: any) {
  switch (toolName) {
    case "get_video_info": {
      const filePath = validatePath(String(args?.filePath), true);
      const info = await getVideoInfo(filePath);
      return {
        content: [{
          type: "text",
          text: info
        }]
      };
    }

    case "convert_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const options = String(args?.options || "");
      
      await ensureDirectoryExists(outputPath);
      const command = `-i "${inputPath}" ${options} "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Video conversion completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "extract_audio": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const format = String(args?.format || "mp3");
      
      await ensureDirectoryExists(outputPath);
      const command = `-i "${inputPath}" -vn -acodec ${format} "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Audio extraction completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "create_video_from_images": {
      const inputPattern = String(args?.inputPattern);
      const outputPath = validatePath(String(args?.outputPath));
      const framerate = Number(args?.framerate || 25);
      const codec = String(args?.codec || "libx264");
      const pixelFormat = String(args?.pixelFormat || "yuv420p");
      const extraOptions = String(args?.extraOptions || "");
      
      if (!inputPattern) {
        throw new Error("Input pattern is required");
      }
      
      await ensureDirectoryExists(outputPath);
      const command = `-framerate ${framerate} -i "${inputPattern}" -c:v ${codec} -pix_fmt ${pixelFormat} ${extraOptions} "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Video creation completed: ${inputPattern} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "trim_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const startTime = String(args?.startTime || "0");
      const duration = String(args?.duration || "");
      const endTime = String(args?.endTime || "");
      
      await ensureDirectoryExists(outputPath);
      
      let command = `-i "${inputPath}" -ss ${startTime}`;
      if (duration) {
        command += ` -t ${duration}`;
      } else if (endTime) {
        command += ` -to ${endTime}`;
      }
      command += ` -c copy "${outputPath}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Video trimming completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "add_watermark": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const watermarkPath = validatePath(String(args?.watermarkPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const position = String(args?.position || "bottomright");
      const opacity = Number(args?.opacity || 0.5);
      
      await ensureDirectoryExists(outputPath);
      
      // Determine overlay position
      let overlayPosition = "";
      switch (position.toLowerCase()) {
        case "topleft":
          overlayPosition = "10:10";
          break;
        case "topright":
          overlayPosition = "W-w-10:10";
          break;
        case "bottomleft":
          overlayPosition = "10:H-h-10";
          break;
        case "center":
          overlayPosition = "(W-w)/2:(H-h)/2";
          break;
        case "bottomright":
        default:
          overlayPosition = "W-w-10:H-h-10";
          break;
      }
      
      // Improved command with better handling of watermark opacity and format
      const command = `-i "${inputPath}" -i "${watermarkPath}" -filter_complex "[1:v]format=rgba,colorchannelmixer=aa=${opacity}[watermark];[0:v][watermark]overlay=${overlayPosition}:format=auto,format=yuv420p" -codec:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Watermark added: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "trim_audio": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const startTime = String(args?.startTime || "0");
      const duration = String(args?.duration || "");
      const endTime = String(args?.endTime || "");
      const format = String(args?.format || "");
      
      await ensureDirectoryExists(outputPath);
      
      // Build the FFmpeg command
      let command = `-i "${inputPath}" -ss ${startTime}`;
      
      // Add duration or end time if provided
      if (duration) {
        command += ` -t ${duration}`;
      } else if (endTime) {
        command += ` -to ${endTime}`;
      }
      
      // Add format if specified, otherwise use copy codec
      if (format) {
        command += ` -acodec ${format}`;
      } else {
        command += ` -acodec copy`;
      }
      
      command += ` "${outputPath}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Audio trimming completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "extract_frames": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputDir = String(args?.outputDir || "output");
      const frameRate = String(args?.frameRate || "1");
      const format = String(args?.format || "jpg");
      const quality = Number(args?.quality || 95);
      const startTime = args?.startTime ? String(args?.startTime) : "";
      const duration = args?.duration ? String(args?.duration) : "";
      
      // Create output directory if it doesn't exist
      await ensureDirectoryExists(join(outputDir, "dummy.txt"));
      
      // Build the FFmpeg command
      let command = `-i "${inputPath}"`;
      
      // Add start time if provided
      if (startTime) {
        command += ` -ss ${startTime}`;
      }
      
      // Add duration if provided
      if (duration) {
        command += ` -t ${duration}`;
      }
      
      // Set frame extraction rate
      command += ` -vf "fps=${frameRate}"`;
      
      // Set quality based on format
      if (format.toLowerCase() === "jpg" || format.toLowerCase() === "jpeg") {
        // For JPEG, use a better quality setting (lower values = higher quality in FFmpeg's scale)
        // Convert 1-100 scale to FFmpeg's 1-31 scale (inverted, where 1 is best quality)
        const ffmpegQuality = Math.max(1, Math.min(31, Math.round(31 - ((quality / 100) * 30))));
        command += ` -q:v ${ffmpegQuality}`;
      } else if (format.toLowerCase() === "png") {
        // For PNG, use compression level (0-9, where 0 is no compression)
        const compressionLevel = Math.min(9, Math.max(0, Math.round(9 - ((quality / 100) * 9))));
        command += ` -compression_level ${compressionLevel}`;
      }
      
      // Set output pattern with 5-digit numbering
      const outputPattern = join(outputDir, `%05d.${format}`);
      command += ` "${outputPattern}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Frames extracted from video: ${inputPath} → ${outputDir}/*.${format}\n\n${result}`
        }]
      };
    }

    case "split_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const segmentDuration = Number(args?.segmentDuration);
      const outputPattern = validatePath(String(args?.outputPattern));
      
      if (segmentDuration <= 0) {
        throw new Error("segmentDuration must be positive");
      }
      
      await ensureDirectoryExists(outputPattern);
      const command = `-i "${inputPath}" -f segment -segment_time ${segmentDuration} -c copy "${outputPattern}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully split video into segments using pattern ${outputPattern}\n\n${result}`
        }]
      };
    }

    case "fade_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const fadeInDuration = Number(args?.fadeInDuration || 0);
      const fadeOutDuration = Number(args?.fadeOutDuration || 0);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (fadeInDuration < 0 || fadeOutDuration < 0) {
        throw new Error("Fade durations must be non-negative");
      }
      
      await ensureDirectoryExists(outputPath);
      
      let videoFilters: string[] = [];
      let audioFilters: string[] = [];
      
      if (fadeInDuration > 0) {
        videoFilters.push(`fade=t=in:st=0:d=${fadeInDuration}`);
        audioFilters.push(`afade=t=in:st=0:d=${fadeInDuration}`);
      }
      
      // For fade-out, we need the video duration, but we don't have a direct equivalent to Python's get_video_duration.
      // Assume fade-out is applied at the end; user must ensure durations are appropriate.
      if (fadeOutDuration > 0) {
        // Note: Without duration, we can't compute fade-out start time accurately.
        // In a production environment, you'd need to extract duration using ffprobe.
        videoFilters.push(`fade=t=out:d=${fadeOutDuration}`);
        audioFilters.push(`afade=t=out:d=${fadeOutDuration}`);
      }
      
      let command = `-i "${inputPath}"`;
      if (videoFilters.length > 0) {
        command += ` -vf "${videoFilters.join(',')}"`;
      }
      if (audioFilters.length > 0) {
        command += ` -af "${audioFilters.join(',')}"`;
      }
      command += ` -c:v libx264 -c:a aac "${outputPath}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied fade to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "concatenate_videos": {
      const inputPaths = (args?.inputPaths as string[])?.map(path => validatePath(path, true));
      const outputPath = validatePath(String(args?.outputPath));
      
      if (!inputPaths || inputPaths.length === 0) {
        throw new Error("At least one input video is required");
      }
      
      await ensureDirectoryExists(outputPath);
      
      // Create a temporary file listing the input files
      const tempFilePath = join("temp_concat_list.txt");
      const fileList = inputPaths.map(path => `file '${path}'`).join("\n");
      writeFileSync(tempFilePath, fileList);
      
      try {
        const command = `-f concat -safe 0 -i "${tempFilePath}" -c copy "${outputPath}" -y`;
        const result = await runFFmpegCommand(command);
        
        return {
          content: [{
            type: "text",
            text: `Successfully concatenated videos to ${outputPath}\n\n${result}`
          }]
        };
      } finally {
        if (existsSync(tempFilePath)) {
          unlinkSync(tempFilePath);
        }
      }
    }

    case "merge_audio_video": {
      const videoPath = validatePath(String(args?.videoPath), true);
      const audioPath = validatePath(String(args?.audioPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      const command = `-i "${videoPath}" -i "${audioPath}" -c copy -map 0:v:0 -map 1:a:0 "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully merged audio and video to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "replace_audio_track": {
      const inputVideoPath = validatePath(String(args?.inputVideoPath), true);
      const inputAudioPath = validatePath(String(args?.inputAudioPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      const command = `-i "${inputVideoPath}" -i "${inputAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully replaced audio in ${outputPath}\n\n${result}`
        }]
      };
    }

    case "overlay_image": {
      const inputVideoPath = validatePath(String(args?.inputVideoPath), true);
      const inputImagePath = validatePath(String(args?.inputImagePath), true);
      const position = String(args?.position || "bottomright");
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      let overlayPosition = "";
      switch (position.toLowerCase()) {
        case "topleft":
          overlayPosition = "10:10";
          break;
        case "topright":
          overlayPosition = "main_w-overlay_w-10:10";
          break;
        case "bottomleft":
          overlayPosition = "10:main_h-overlay_h-10";
          break;
        case "center":
          overlayPosition = "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
          break;
        case "bottomright":
        default:
          overlayPosition = "main_w-overlay_w-10:main_h-overlay_h-10";
          break;
      }
      
      const command = `-i "${inputVideoPath}" -i "${inputImagePath}" -filter_complex "[0:v][1:v]overlay=${overlayPosition}[v]" -map "[v]" -map "0:a?" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully overlaid image on ${outputPath}\n\n${result}`
        }]
      };
    }

    case "transform_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const transformation = String(args?.transformation);
      const params = args?.params || {};
      const outputPath = validatePath(String(args?.outputPath));
      
      const validTransformations = ["crop", "scale", "rotate", "flip", "transpose", "pad"];
      if (!validTransformations.includes(transformation)) {
        throw new Error(`Invalid transformation. Must be one of ${validTransformations.join(", ")}`);
      }
      
      await ensureDirectoryExists(outputPath);
      
      let filterStr = "";
      if (transformation === "crop") {
        filterStr = `crop=${params.width}:${params.height}:${params.x}:${params.y}`;
      } else if (transformation === "scale") {
        filterStr = `scale=${params.width}:${params.height}`;
      } else if (transformation === "rotate") {
        filterStr = `rotate=${params.angle}*PI/180`;
      } else if (transformation === "flip") {
        if (!["horizontal", "vertical"].includes(params.direction)) {
          throw new Error("direction must be 'horizontal' or 'vertical'");
        }
        filterStr = params.direction === "horizontal" ? "hflip" : "vflip";
      } else if (transformation === "transpose") {
        if (!(0 <= Number(params.dir) && Number(params.dir) <= 3)) {
          throw new Error("dir must be between 0 and 3");
        }
        filterStr = `transpose=${params.dir}`;
      } else if (transformation === "pad") {
        const color = params.color || "black";
        filterStr = `pad=${params.width}:${params.height}:${params.x}:${params.y}:${color}`;
      }
      
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully transformed video to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "apply_color_curves": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const redCurve = String(args?.redCurve);
      const greenCurve = String(args?.greenCurve);
      const blueCurve = String(args?.blueCurve);
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      const curvesFilter = `curves=red='${redCurve}':green='${greenCurve}':blue='${blueCurve}'`;
      const eqFilter = "eq=contrast=1.2:saturation=0.8";
      const vignetteAngle = Math.PI / 4;
      const vignetteFilter = `vignette=angle=${vignetteAngle}`;
      const filterStr = [curvesFilter, eqFilter, vignetteFilter].join(",");
      
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:v libx264 -preset ultrafast -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied color curves to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "set_video_fps": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const fps = Number(args?.fps);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (fps <= 0) {
        throw new Error("fps must be positive");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const filterStr = `fps=fps=${fps}`;
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully set fps to ${fps} in ${outputPath}\n\n${result}`
        }]
      };
    }

    case "add_video_noise": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const noiseStrength = Number(args?.noiseStrength);
      const noiseFlags = String(args?.noiseFlags);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (noiseStrength < 0) {
        throw new Error("noiseStrength must be non-negative");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const filterStr = `noise=c0s=${noiseStrength}:c0f=${noiseFlags}`;
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully added noise to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "apply_overlay": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const overlayPath = validatePath(String(args?.overlayPath), true);
      const position = String(args?.position || "bottomright");
      const opacity = Number(args?.opacity);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (!(0 <= opacity && opacity <= 1)) {
        throw new Error("opacity must be between 0 and 1");
      }
      
      await ensureDirectoryExists(outputPath);
      
      let overlayPosition = "";
      switch (position.toLowerCase()) {
        case "topleft":
          overlayPosition = "10:10";
          break;
        case "topright":
          overlayPosition = "main_w-overlay_w-10:10";
          break;
        case "bottomleft":
          overlayPosition = "10:main_h-overlay_h-10";
          break;
        case "center":
          overlayPosition = "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
          break;
        case "bottomright":
        default:
          overlayPosition = "main_w-overlay_w-10:main_h-overlay_h-10";
          break;
      }
      
      const filterComplex = `[1:v]format=yuva444p,colorchannelmixer=aa=${opacity}[overlay];[0:v][overlay]overlay=${overlayPosition}[v]`;
      const command = `-i "${inputPath}" -i "${overlayPath}" -filter_complex "${filterComplex}" -map "[v]" -map "0:a?" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied overlay to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "apply_filter_template": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const templateName = String(args?.templateName);
      const outputPath = validatePath(String(args?.outputPath));
      const filtersDir = join("E:", "mcpffmpeg", "src", "filters");
      const templatePath = join(filtersDir, `${templateName}.json`);
      if (!existsSync(templatePath)) {
        throw new Error(`Filter template ${templateName} not found at ${templatePath}`);
      }
      
      await ensureDirectoryExists(outputPath);
      
      const template = JSON.parse(readFileSync(templatePath, "utf-8"));
      
      let currentFile = inputPath;
      const tempFiles: string[] = [];
      
      if (template.curves && template.eq && template.vignette) {
        const curves = template.curves;
        const eq = template.eq;
        const vignette = template.vignette;
        
        const curvesFilter = `curves=red='${curves.red}':green='${curves.green}':blue='${curves.blue}'`;
        const eqFilter = `eq=contrast=${eq.contrast}:saturation=${eq.saturation}`;
        const vignetteFilter = `vignette=angle=${vignette.angle}`;
        const filterStr = [curvesFilter, eqFilter, vignetteFilter].join(",");
        
        const tempOutput = `temp_${tempFiles.length}.mp4`;
        tempFiles.push(tempOutput);
        
        const command = `-i "${currentFile}" -vf "${filterStr}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${tempOutput}" -y`;
        await runFFmpegCommand(command);
        currentFile = tempOutput;
      }
      
      if (template.fps) {
        const fps = template.fps;
        const tempOutput = `temp_${tempFiles.length}.mp4`;
        tempFiles.push(tempOutput);
        
        const command = `-i "${currentFile}" -vf "fps=fps=${fps}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${tempOutput}" -y`;
        await runFFmpegCommand(command);
        currentFile = tempOutput;
      }
      
      if (template.noise) {
        const noise = template.noise;
        const filterStr = `noise=c0s=${noise.strength}:c0f=${noise.flags}`;
        const tempOutput = `temp_${tempFiles.length}.mp4`;
        tempFiles.push(tempOutput);
        
        const command = `-i "${currentFile}" -vf "${filterStr}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${tempOutput}" -y`;
        await runFFmpegCommand(command);
        currentFile = tempOutput;
      }
      
      // Final step: Ensure the output is compatible by re-encoding if necessary
      const finalCommand = `-i "${currentFile}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${outputPath}" -y`;
      await runFFmpegCommand(finalCommand);
      
      // Clean up temporary files
      for (const tempFile of tempFiles) {
        if (existsSync(tempFile)) {
          unlinkSync(tempFile);
        }
      }
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied ${templateName} filter to ${outputPath}`
        }]
      };
    }

    case "list_filter_templates": {
      const filtersDir = join("E:", "mcpffmpeg", "src", "filters"); // Absolute path to filters directory
      if (!existsSync(filtersDir)) {
        return {
          content: [{
            type: "text",
            text: `No filter templates found at ${filtersDir}.`
          }]
        };
      }
      
      const templates = readdirSync(filtersDir)
        .filter(f => f.endsWith(".json"))
        .map(f => f.split(".")[0]);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(templates)
        }]
      };
    }

    case "remove_segment": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const startTime = String(args?.startTime);
      const endTime = String(args?.endTime);
      const outputPath = validatePath(String(args?.outputPath));
      
      // Validate startTime and endTime by converting to seconds
      const startSec = parseTimeToSeconds(startTime);
      const endSec = parseTimeToSeconds(endTime);
      
      if (startSec < 0 || endSec <= startSec) {
        throw new Error("startTime must be non-negative, and endTime must be greater than startTime");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const tempFiles: string[] = [];
      try {
        // Step 1: Extract the part before the segment (0 to startTime)
        const part1Path = "temp_part1.mp4";
        tempFiles.push(part1Path);
        const part1Command = `-i "${inputPath}" -ss 0 -t ${startTime} -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${part1Path}" -y`;
        await runFFmpegCommand(part1Command);
        
        // Step 2: Extract the part after the segment (endTime to end)
        const part2Path = "temp_part2.mp4";
        tempFiles.push(part2Path);
        const part2Command = `-i "${inputPath}" -ss ${endTime} -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${part2Path}" -y`;
        await runFFmpegCommand(part2Command);
        
        // Step 3: Check if both parts were created successfully
        if (!existsSync(part1Path) || !existsSync(part2Path)) {
          throw new Error("Failed to create one or both video segments");
        }
        
        // Step 4: Concatenate the two parts
        const concatListPath = "temp_concat_list.txt";
        tempFiles.push(concatListPath);
        const concatList = `file '${part1Path}'\nfile '${part2Path}'`;
        writeFileSync(concatListPath, concatList);
        
        const concatCommand = `-f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${outputPath}" -y`;
        const result = await runFFmpegCommand(concatCommand);
        
        return {
          content: [{
            type: "text",
            text: `Successfully removed segment (${startTime} to ${endTime}) from ${inputPath}. Output saved to ${outputPath}\n\n${result}`
          }]
        };
      } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
          if (existsSync(tempFile)) {
            unlinkSync(tempFile);
          }
        }
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}