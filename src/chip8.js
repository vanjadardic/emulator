'use strict';

var Chip8 = function(canvas, scale, volume) {
   this.canvas = canvas;
   this.scale = scale;
   this.volume = volume;
   this.speed = 0.8; //kHz
   this.timerSpeed = 0.06; //kHz

   var audioCtx = new AudioContext();
   var audioOscillator = audioCtx.createOscillator();
   audioOscillator.type = 'square';
   audioOscillator.frequency.value = 60;
   audioOscillator.start(0);
   this.buzzer = audioCtx.createGain();
   this.buzzer.gain.value = 0;
   audioOscillator.connect(this.buzzer);
   this.buzzer.connect(audioCtx.destination);

   this.canvasCtx = canvas.getContext('2d');
   this.display = this.canvasCtx.createImageData(canvas.width, canvas.height);
   this.displayMemory = new Array(0x100);
   this.memory = new Array(0x1000);
   this.stack = new Array(0x10);
   this.v = new Array(0x10);
   this.rom = new Array(0);

   this.prevKeys = new Array(16);
   this.keys = {};
   document.addEventListener('keydown', function(e) {
      this.keys[e.keyCode] = true;
   }.bind(this), true);
   document.addEventListener('keyup', function(e) {
      this.keys[e.keyCode] = false;
   }.bind(this), true);
   this.keyMap = [66, 52, 53, 54, 82, 84, 89, 70, 71, 72, 86, 78, 55, 85, 74, 77];

   this.prevTimestamp = 0;
   requestAnimationFrame(this.step.bind(this));
};

Chip8.prototype.load = function(rom) {
   this.rom = rom;
   this.reset();
};

Chip8.prototype.reset = function() {
   for (var i = 0; i < this.memory.length; i++) {
      this.memory[i] = 0;
   }
   for (var i = 0; i < this.stack.length; i++) {
      this.stack[i] = 0;
   }
   for (var i = 0; i < this.v.length; i++) {
      this.v[i] = 0;
   }
   for (var i = 0; i < this.displayMemory.length; i++) {
      this.displayMemory[i] = 0;
   }
   var hexDigits = [
      0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
      0x20, 0x60, 0x20, 0x20, 0x70, // 1
      0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
      0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
      0x90, 0x90, 0xF0, 0x10, 0x10, // 4
      0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
      0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
      0xF0, 0x10, 0x20, 0x40, 0x40, // 7
      0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
      0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
      0xF0, 0x90, 0xF0, 0x90, 0x90, // A
      0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
      0xF0, 0x80, 0x80, 0x80, 0xF0, // C
      0xE0, 0x90, 0x90, 0x90, 0xE0, // D
      0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
      0xF0, 0x80, 0xF0, 0x80, 0x80  // F
   ];
   for (var i = 0; i < hexDigits.length; i++) {
      this.memory[i] = hexDigits[i];
   }
   this.pc = 0x200;
   for (var i = 0; i < this.rom.length; i++) {
      this.memory[this.pc + i] = this.rom[i];
   }
   this.sp = 0;
   this.i = 0;
   this.delayTimer = 0;
   this.soundTimer = 0;
   this.delayTimerF = 0;
   this.soundTimerF = 0;
   this.waitingForKeypress = false;
};

Chip8.prototype.setVolume = function(volume) {
   this.volume = volume;
   if (this.soundTimerF > 0) {
      this.buzzer.gain.value = this.volume;
   }
};

Chip8.prototype.setScale = function(scale) {
   this.scale = scale;
   this.canvas.width = 64 * this.scale;
   this.canvas.height = 32 * this.scale;
   this.display = this.canvasCtx.createImageData(this.canvas.width, this.canvas.height);
};

Chip8.prototype.step = function(timestamp) {
   if (this.prevTimestamp !== 0) {
      var elapsed = timestamp - this.prevTimestamp;
      for (var i = (elapsed * this.speed) | 0; i >= 0; i--) {
         this.tick();
      }
   }
   this.prevTimestamp = timestamp;

   for (var i = 0; i < this.displayMemory.length; i++) {
      var byte = this.displayMemory[i];
      for (var j = 0; j < 8; j++) {
         var bit = ((byte >> (7 - j)) & 0x01) * 255;
         var idx = i * 8 + j;
         idx = (idx + ((idx / 64) | 0) * 64 * (this.scale - 1)) * this.scale * 4;
         for (var sx = 0; sx < this.scale; sx++) {
            for (var sy = 0; sy < this.scale; sy++) {
               var scaledIdx = idx + (this.display.width * sy + sx) * 4;
               this.display.data[scaledIdx] = bit;
               this.display.data[scaledIdx + 1] = bit;
               this.display.data[scaledIdx + 2] = bit;
               this.display.data[scaledIdx + 3] = 255;
            }
         }
      }
   }
   this.canvasCtx.putImageData(this.display, 0, 0);
   requestAnimationFrame(this.step.bind(this));
};

Chip8.prototype.tick = function() {
   if (this.delayTimerF > 0) {
      this.delayTimerF -= this.timerSpeed / this.speed;
      if (this.delayTimerF < 0) {
         this.delayTimerF = 0;
      }
      this.delayTimer = this.delayTimerF | 0;
   }
   if (this.soundTimerF > 0) {
      this.soundTimerF -= this.timerSpeed / this.speed;
      if (this.soundTimerF < 0) {
         this.soundTimerF = 0;
      }
      this.soundTimer = this.soundTimerF | 0;
   }
   this.buzzer.gain.value = this.soundTimer > 0 ? this.volume : 0;
   if (this.waitingForKeypress) {
      return;
   }
   var inst = this.memory[this.pc] << 8 | this.memory[this.pc + 1];
   this.pc += 2;
   var addr = inst & 0x0FFF;
   var x = (inst >> 8) & 0x0F;
   var y = (inst >> 4) & 0x0F;
   var byte = inst & 0xFF;
   switch (inst & 0xF000) {
      case 0x0000:
         switch (inst) {
            case 0x00E0: // CLS
               for (var i = 0; i < this.displayMemory.length; i++) {
                  this.displayMemory[i] = 0;
               }
               break;
            case 0x00EE: // RET
               this.pc = this.stack[--this.sp];
               break;
         }
         break;
      case 0x1000: // JP addr
         this.pc = addr;
         break;
      case 0x2000: // CALL addr
         this.stack[this.sp++] = this.pc;
         this.pc = addr;
         break;
      case 0x3000: // SE Vx, byte
         if (this.v[x] === byte) {
            this.pc += 2;
         }
         break;
      case 0x4000: // SNE Vx, byte
         if (this.v[x] !== byte) {
            this.pc += 2;
         }
         break;
      case 0x5000: // SE Vx, Vy
         if (this.v[x] === this.v[y]) {
            this.pc += 2;
         }
         break;
      case 0x6000: // LD Vx, byte
         this.v[x] = byte;
         break;
      case 0x7000: // 7xkk - ADD Vx, byte
         this.v[x] = (this.v[x] + byte) & 0xFF;
         break;
      case 0x8000:
         switch (inst & 0x000F) {
            case 0x0: // LD Vx, Vy
               this.v[x] = this.v[y];
               break;
            case 0x1: // OR Vx, Vy
               this.v[x] |= this.v[y];
               break;
            case 0x2: // AND Vx, Vy
               this.v[x] &= this.v[y];
               break;
            case 0x3: // XOR Vx, Vy
               this.v[x] ^= this.v[y];
               break;
            case 0x4: // ADD Vx, Vy
               this.v[15] = ((this.v[x] + this.v[y]) > 0xFF) ? 1 : 0;
               this.v[x] = (this.v[x] + this.v[y]) & 0xFF;
               break;
            case 0x5: // SUB Vx, Vy
               this.v[15] = (this.v[x] > this.v[y]) ? 1 : 0;
               this.v[x] = (this.v[x] - this.v[y] + 0x100) & 0xFF;
               break;
            case 0x6: // SHR Vx {, Vy}
               this.v[15] = this.v[x] & 0x01;
               this.v[x] >>= 1;
               break;
            case 0x7: // SUBN Vx, Vy
               this.v[15] = (this.v[y] > this.v[x]) ? 1 : 0;
               this.v[x] = (this.v[y] - this.v[x] + 0x100) & 0xFF;
               break;
            case 0xE: // SHL Vx {, Vy}
               this.v[15] = this.v[x] >> 7;
               this.v[x] <<= 1;
               break;
         }
         break;
      case 0x9000: // SNE Vx, Vy
         if (this.v[x] !== this.v[y]) {
            this.pc += 2;
         }
         break;
      case 0xA000: // LD I, addr
         this.i = addr;
         break;
      case 0xB000: // JP V0, addr
         this.pc = addr + this.v[0];
         break;
      case 0xC000: // RND Vx, byte
         this.v[x] = ((Math.random() * 0x100) | 0) & byte;
         break;
      case 0xD000: // DRW Vx, Vy, nibble
         var nibble = inst & 0x0F;
         var posX = this.v[x] % 64;
         var posY = this.v[y] % 32;
         this.v[15] = 0;
         var tmp;
         for (var i = 0; i < nibble; i++) {
            var byteSplit = posX % 8;
            var tmpX = (posX / 8) | 0;
            var tmpY = ((posY + i) % 32) * 8;
            tmp = tmpY + tmpX;
            if ((this.displayMemory[tmp] & (this.memory[this.i + i] >> byteSplit)) > 0) {
               this.v[15] = 1;
            }
            this.displayMemory[tmp] ^= this.memory[this.i + i] >> byteSplit;
            if (byteSplit > 0) {
               tmp = tmpY + ((tmpX + 1) % 8);
               if ((this.displayMemory[tmp] & ((this.memory[this.i + i] << (8 - byteSplit)) & 0xFF)) > 0) {
                  this.v[15] = 1;
               }
               this.displayMemory[tmp] ^= (this.memory[this.i + i] << (8 - byteSplit)) & 0xFF;
            }
         }
         break;
      case 0xE000:
         switch (byte) {
            case 0x9E: // SKP Vx
               if (this.keys[this.keyMap[this.v[x]]]) {
                  this.pc += 2;
               }
               break;
            case 0xA1: // SKNP Vx
               if (!this.keys[this.keyMap[this.v[x]]]) {
                  this.pc += 2;
               }
               break;
         }
         break;
      case 0xF000:
         switch (byte) {
            case 0x07: // LD Vx, DT
               this.v[x] = this.delayTimer;
               break;
            case 0x0A: // LD Vx, K
               this.waitingForKeypress = true;
               for (var i = 0; i < 16; i++) {
                  this.prevKeys[i] = this.keys[this.keyMap[i]];
               }
               var waitForKeypress = function() {
                  for (var i = 0; i < this.keyMap.length; i++) {
                     if (!this.prevKeys[i] && this.keys[this.keyMap[i]]) {
                        this.v[x] = i;
                        this.waitingForKeypress = false;
                        return;
                     }
                     this.prevKeys[i] = this.keys[this.keyMap[i]];
                  }
                  setTimeout(waitForKeypress, 10);
               }.bind(this);
               waitForKeypress();
               break;
            case 0x15: // LD DT, Vx
               this.delayTimerF = this.v[x];
               break;
            case 0x18: // LD ST, Vx
               this.soundTimerF = this.v[x];
               break;
            case 0x1E: // ADD I, Vx
               this.i = (this.i + this.v[x]) & 0xFFFF;
               break;
            case 0x29: // LD F, Vx
               this.i = this.v[x] * 5;
               break;
            case 0x33: // LD B, Vx
               this.memory[this.i] = (this.v[x] / 100) | 0;
               this.memory[this.i + 1] = ((this.v[x] / 10) | 0) % 10;
               this.memory[this.i + 2] = this.v[x] % 10;
               break;
            case 0x55: // LD [I], Vx
               for (var i = 0; i <= x; i++) {
                  this.memory[this.i + i] = this.v[i];
               }
               break;
            case 0x65: // LD Vx, [I]
               for (var i = 0; i <= x; i++) {
                  this.v[i] = this.memory[this.i + i];
               }
               break;
         }
         break;
   }
};
