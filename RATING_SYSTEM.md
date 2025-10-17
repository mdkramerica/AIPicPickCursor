# Photo Rating System Documentation

## Overview
The AI Group Photo Selector uses a sophisticated multi-factor scoring system to evaluate photos and recommend the best one where everyone looks their best. This document explains how photos are analyzed and rated.

## Face Detection Model
**Model:** SSD MobileNet v1  
**Purpose:** Accurate detection of multiple faces in group photos  
**Configuration:**
- Minimum confidence threshold: 0.5 (50%)
- Better accuracy for group photos compared to lightweight models
- ~2-3x slower than Tiny Face Detector, but significantly more accurate

## Individual Face Analysis

Each detected face is analyzed for three key attributes:

### 1. Eye Openness Detection
**Method:** Eye Aspect Ratio (EAR) Algorithm

The algorithm calculates the ratio of vertical to horizontal eye distances:
- Measures two vertical distances (between eyelid points)
- Measures one horizontal distance (corner to corner)
- Computes EAR = (vertical1 + vertical2) / (2.0 × horizontal)

**Threshold:** EAR > 0.22
- Eyes are considered "open" if EAR exceeds 0.22
- Values below 0.22 indicate closed or squinting eyes

**Scoring Impact:** 
- Eyes open: +40 points (per face)
- Eyes closed: 0 points

### 2. Smile Detection
**Method:** Facial Expression Analysis

Uses the face expression neural network to detect happiness:
- Analyzes facial landmarks around the mouth
- Measures expression confidence scores

**Threshold:** Happy expression > 0.5 (50% confidence)

**Scoring Impact:**
- Smiling: +30 points (per face)
- Not smiling: 0 points
- Smile intensity also recorded (0-1 scale)

### 3. Expression Classification
**Detected Expressions:**
- Happy
- Neutral
- Sad
- Surprised
- Angry

**Scoring Impact:**
- Happy: +15 points contribution
- Neutral: +15 points contribution
- Sad/Angry: Counted as "poor expressions"

### 4. Detection Confidence
**Method:** Face detection confidence score (0-1)

**Scoring Impact:** Detection confidence × 15 points

## Face Quality Score Calculation

Each face receives a quality score (0-100):

```
Face Quality Score = Eye Score + Smile Score + Expression Score + Detection Score

Where:
- Eye Score = 40 if eyes open, else 0
- Smile Score = 30 if smiling, else 0
- Expression Score = (happy_confidence + neutral_confidence) × 15
- Detection Score = face_detection_confidence × 15
```

**Maximum possible:** 100 points per face

## Overall Photo Quality Score

The overall photo quality aggregates all faces:

### Step 1: Calculate Face Statistics
- Count faces with eyes open
- Count faces smiling
- Calculate average face quality

### Step 2: Apply Weighted Scoring
```
Overall Score = Eyes Open Score + Smiling Score + Face Quality Score

Where:
- Eyes Open Score = (eyes_open_count / total_faces) × 40
- Smiling Score = (smiling_count / total_faces) × 40
- Face Quality Score = (average_face_quality / 100) × 20
```

**Maximum possible:** 100 points per photo

### Scoring Breakdown
- **40 points:** Proportion of people with eyes open
- **40 points:** Proportion of people smiling
- **20 points:** Average individual face quality

## Photo Recommendations

Photos are categorized into four recommendation levels:

| Score Range | Recommendation | Meaning |
|------------|---------------|---------|
| 85-100 | **Best** | Excellent photo - everyone looks great |
| 70-84 | **Good** | Good photo - most people look good |
| 50-69 | **Acceptable** | Okay photo - some issues detected |
| 0-49 | **Poor** | Poor photo - multiple issues |

## Issue Detection

The system tracks three types of issues:

### 1. Closed Eyes
- Count of people with eyes detected as closed
- Major negative factor (loses 40 points per person)

### 2. Poor Expressions
- Count of people with sad or angry expressions
- Moderate negative factor

### 3. Blurry Faces
- Currently not implemented (reserved for future enhancement)

## Best Photo Selection

The photo with the **highest overall quality score** is selected as the winner.

**Tie-breaking:** If multiple photos have identical scores, the first one analyzed wins.

## Face Detection Limitations

Faces may not be detected if they are:
- **Too small:** Faces should be at least 80×80 pixels
- **At extreme angles:** Side profiles or tilted heads
- **Partially occluded:** Hidden by objects or other people
- **In poor lighting:** Very dark or overexposed
- **Out of focus:** Blurry or low resolution
- **At edges:** Partially visible at photo boundaries

## Algorithm Summary

```
For each photo:
  1. Detect all faces using SSD MobileNet v1
  2. For each face:
     - Detect eye openness (EAR algorithm)
     - Detect smile (expression analysis)
     - Classify overall expression
     - Calculate face quality score (0-100)
  3. Calculate overall photo score:
     - 40% based on eyes open
     - 40% based on smiling
     - 20% based on average face quality
  4. Assign recommendation level

Select photo with highest overall score as "Best"
```

## Technical Implementation

**Models Used:**
- `ssdMobilenetv1` - Face detection
- `faceLandmark68Net` - Facial landmark detection (68 points)
- `faceExpressionNet` - Expression classification

**Framework:** TensorFlow.js with face-api.js wrapper  
**Runtime:** Node.js backend with CPU inference

## Version History

### Current Version (October 2025)
- Face detection: SSD MobileNet v1 (minConfidence: 0.5)
- Eye detection threshold: EAR > 0.22
- Confidence threshold balanced for accuracy

### Previous Versions
- Used Tiny Face Detector (less accurate for group photos)
- Eye detection thresholds tested: 0.2, 0.25 (settled on 0.22)
- Face detection thresholds adjusted from 0.5 → 0.4 → 0.3 (now using SSD at 0.5)
