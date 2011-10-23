(function () {


// Default settings
var bpm               = 140;
var wave_table_length = 256;
var wave_tables       = {};
var do_change_key     = true;
var do_animation      = true;


// Create wave form tables
// They must have ( wave_table_length + 1 ) atoms
// for convinience in Linear interpolation.

// Create sine table
( function () {
    var table = [];
    for ( var i = 0; i < wave_table_length + 1; i++ ) {
        table[i] = Math.sin( i * Math.PI * 2 / wave_table_length );
    }
    wave_tables['sine'] = table;
})();

// Create squared sine table
( function () {
    var table = [];
    for ( var i = 0; i < wave_table_length + 1; i++ ) {
        table[i] = Math.pow( Math.sin( i * Math.PI * 2 / wave_table_length ), 2);
    }
    wave_tables['sine2'] = table;
})();

// Create steel table
// NOTE: frequently play of short buffer filled by noise sounds like steel string.
// FIXME: more quality sound is needed.
( function () {
    var table = [];
    for ( var i = 0; i < wave_table_length + 1; i++ ) {
        table[i] = Math.random() * 2 - 1.0;
    }
    wave_tables['steel'] = table;
})();

// Create saw-tooth table
( function () {
    var table = [];
    for ( var i = 0; i < wave_table_length + 1; i++ ) {
        table[i] = ( i / wave_table_length ) * 2 - 1;
    }
    wave_tables['saw'] = table;
})();



function Oscillator (manager, opts) {
    this.freq = opts.freq || 440;
    this.type = opts.type || 'saw';
    this.pos  = 0;
    this.len  = wave_table_length;
    this.sr   = manager.context.sampleRate;
    this.step = this.len / ( this.sr / this.freq );
}

Oscillator.prototype = {
    setFreq: function ( freq ) {
        if ( undefined !== freq ) {
            this.freq = freq;
            this.step = this.len / ( this.sr / this.freq );
        }
        return this.freq;
    },
    get: function () {
        this.pos += this.step;
        if ( this.pos > wave_table_length ) {
            this.pos -= Math.floor( this.pos / wave_table_length ) * wave_table_length;
        }
        var f  = Math.floor(this.pos);
        var v1 = wave_tables[this.type][f];
        var v2 = wave_tables[this.type][f + 1];
        return v1 + ( v2 - v1 ) * ( this.pos - f );
    }
};


function Instrument (manager, opts) {
    this.manager = manager;
    if ( undefined === opts ) opts = {};
    this.init(opts);
}

Instrument.prototype = {
    init: function (opts) {
        this.attack   = undefined !== opts.attack  ? opts.attack  : 200;
        this.decay    = undefined !== opts.decay   ? opts.decay   : 500;
        this.sustain  = undefined !== opts.sustain ? opts.sustain : 0.2;
        this.release  = undefined !== opts.release ? opts.release : 2000;
        this.oscs     = [ new Oscillator(this.manager,{ type: 'sine' }) ];
        this._amp     = 0.0;
        this._noting   = false;
        this._sounding = false;
    },
    noteOn: function (note, volume, length) {
        this._noting       = true;
        this._sounding     = true;
        this._duration     = 0;
        this._release      = 0;
        this._attack_ratio = ( volume - this._amp ) / this.attack;
        this._decay_ratio  = ( 1 - this.sustain ) / this.decay;
        this._length       = length;
        for ( var i = 0; i < this.oscs.length; i++ ) this.oscs[i].setFreq(note);
    },
    noteOff: function () {

        this._noting = false;
        this._release_ratio = this._amp / this.release;
    },
    get: function () {
        if ( !this._sounding ) return 0.0;
        if ( !this._noting  ) {
            this._amp -= this._release_ratio;
            if ( this._amp < 0.0 ) this._sounding = false;
        }
        else if ( this._duration < this.attack ) {
            this._amp += this._attack_ratio;
        }
        else if ( this._duration < this.attack + this.decay ) {
            this._amp -= this._decay_ratio;
        }
        this._duration++;
        if ( this._sounding && this._length < this._duration ) this.noteOff();
        var v = 0.0;
        for ( var i = 0; i < this.oscs.length; i++ ) {
            v += this.oscs[i].get() / this.oscs.length;
        }
        return v * this._amp;
    }
};

function SoundManager (cb) {
    this.cb           = cb;
    //this.bufferLength = 2048;   // about 23.5 fps. It's good for animation.
    this.bufferLength = 4096;   // A bit slow about animation, but safe against glitch noise.
    this.context      = new webkitAudioContext();
    this.destination  = this.context.destination;
    this.channels     = this.destination.numberOfChannels;
    this.node         = this.context.createJavaScriptNode(this.bufferLength, 0, this.channels);
    this.init();
}

SoundManager.prototype = {
    init: function () {
        var that     = this;
        var clickers = [];

        this.insts = {
            sin:  new Instrument(this, {attack: 20, decay: 2000, sustain: 0.3  }),
            sin2: new Instrument(this, {attack: 20, decay: 4000, sustain: 0.01 }),
            seq:  new Instrument(this, {}),
            kick: new Instrument(this, { attack: 30, decay: 3000, sustain: 0.01 }),
            snr:  new Instrument(this, { attack: 30, decay: 2000, sustain: 0.01 })
        };

        this.insts.sin.oscs = [
            new Oscillator(this, { type: 'sine' }),
            new Oscillator(this, { type: 'sine' })
        ];
        this.insts.sin.noteOn = function (note, volume, length) {
            this.__proto__.noteOn.apply(this, [note, volume, length]);
            this.oscs[1].setFreq(note * 0.75 );
        },

        this.insts.sin2.oscs = [
            new Oscillator(this, { type: 'sine2' }),
            new Oscillator(this, { type: 'sine2' })
        ];
        this.insts.sin2.noteOn = function (note, volume, length) {
            this.__proto__.noteOn.apply(this, [note, volume, length]);
            this.oscs[1].setFreq(note * 1.5 );
        },

        this.insts.seq.oscs = [
            new Oscillator(this, { type: 'saw' }),
            new Oscillator(this, { type: 'saw' })
        ];
        this.insts.seq.noteOn = function (note, volume, length) {
            this.__proto__.noteOn.apply(this, [note, volume, length]);
            this.oscs[1].setFreq(note * 1.5);
        },

        this.insts.kick.oscs = [
            new Oscillator(this, { type: 'sine' }),
            new Oscillator(this, { type: 'sine2' })
        ];
        this.insts.kick.noteOn = function (note, volume, length) {
            this.__proto__.noteOn.apply(this, [180, volume, 10000]);
            this.oscs[1].setFreq(note * 3);
        },
        this.insts.kick.get = function () {
            this.oscs[0].setFreq( this.oscs[0].freq * 0.9998 );
            this.oscs[1].setFreq( this.oscs[1].freq * 0.9994 );
            var v = this.__proto__.get.apply(this);
            v *= 2.3;
            if ( v > 1.0 ) v = 1.0;
            if ( v < -1.0 ) v = -1.0;
            return v;
        };

        this.insts.snr.oscs = [
            new Oscillator(this, { type: 'sine2' }),
            new Oscillator(this, { type: 'saw' })
        ];
        this.insts.snr.noteOn = function (note, volume, length) {
            this.__proto__.noteOn.apply(this, [note * 2, 1.0, 2000]);
            this.oscs[1].setFreq(note * 3);
        };

        var snr_fltr = 0.0;
        this.insts.snr.get = function () {
            var v = this.__proto__.get.apply(this);
            v += Math.random() * this._amp * 0.4;
            v *= 1.3;
            if ( v > 0.8 ) v = 0.8;
            if ( v < -0.8 ) v = -0.8;
            v = (v + snr_fltr) / 2;
            snr_fltr = v;
            return v;
        };

        var delay_buffer   = new Array();
        var delay_idx      = 0;
        var delay_feedback = 0.45;

        var last_v = 0.0;

        var last_tag  = '';
        var last_tag2 = '';
        var last_tag3 = '';
        var last_tag4 = '';
        var last_tag5 = '';
        var last_tag6 = '';
        var cont      = 0;

        var freq1_base = 61.875;
        var freq2_base = freq1_base * 1.5;
        var freq1      = freq1_base;
        var freq2      = freq2_base;

        this.node.onaudioprocess = function (e) {
            var event_map = that.cb(that, that.bufferLength);
            var buffer    = new Float32Array(that.bufferLength);
            var delay_len = Math.floor((( that.context.sampleRate * 60 ) / bpm) * 0.75);

            for ( var i = 0; i < buffer.length; i++ ) {
                var v = 0.0;
                var $elem = event_map[i];
                if ( $elem ) {
                    var tag = $elem.get(0).tagName;

                    // Change key from tagname
                    if ( do_change_key ) {
                        if ( tag == 'H1') {
                            freq1_base *= ( 4 / 3 );
                            freq2_base = freq1_base * 1.5;
                            if ( freq1_base > 100 ) freq1_base /= 2;
                            if ( freq2_base > 100 ) freq2_base /= 2;
                        }
                        else if ( tag == 'H2') {
                            freq1_base *= Math.pow( 2, 10 / 12 );
                            freq2_base = freq1_base * 1.5;
                            if ( freq1_base > 100 ) freq1_base /= 2;
                            if ( freq2_base > 100 ) freq2_base /= 2;
                        }
                    }

                    // Make instrument list from tagname
                    var inst = [];
                    if ( tag == 'DIV' ) {
                        inst.push('seq');
                    }
                    else if ( tag == 'A' ) {
                        inst.push('kick');
                        inst.push('seq');
                    }
                    else if ( tag == 'LI' ) {
                        inst.push('sin2');
                    }
                    else if ( tag == 'SPAN' ) {
                        inst.push('sin2');
                    }
                    else if ( tag == 'IMG' ) {
                        inst.push('snr');
                    }
                    else {
                        inst.push('sin');
                    }

                    // Avoid the boredom
                    if ( tag == last_tag && last_tag == last_tag2 && last_tag2 == last_tag3 ) {
                        cont++;
                        freq1 = (1 == cont % 8 ) ? ( freq1 * 1.5 ) : freq1;
                        freq2 = (1 == cont % 6 ) ? ( freq2 * 1.5 ) : freq2;
                        if ( freq1 > 20000 ) freq1 = freq1_base;
                        if ( freq2 > 10000 ) freq2 = freq2_base;
                        delay_feedback *= 1.01;
                    }
                    else if ( last_tag2 == tag && last_tag4 == last_tag2 ) {
                        cont++;
                        freq1 = (1 == cont % 6 ) ? ( freq1 * 1.5 ) : freq1;
                        freq2 = (1 == cont % 8 ) ? ( freq2 * 2.0 ) : freq2;
                        if ( freq1 > 12000 ) freq1 = freq1_base;
                        if ( freq2 > 24000 ) freq2 = freq2_base;
                        delay_feedback *= 1.013;
                    }
                    else if ( last_tag3 == tag && last_tag3 == last_tag6 ) {
                        cont++;
                        freq1 = (1 == cont % 6 ) ? ( freq1 * 2.0 ) : freq1;
                        freq2 = (1 == cont % 4 ) ? ( freq2 * 2.0 ) : freq2;
                        if ( freq1 > 20000 ) freq1 = freq1_base;
                        if ( freq2 > 20000 ) freq2 = freq2_base;
                        delay_feedback *= 1.018;
                    }
                    else {
                        cont = 0;
                        freq1 = freq1_base;
                        freq2 = freq2_base;
                        delay_feedback = 0.2;
                    }

                    // FIXME: use ring buffer
                    last_tag6 = last_tag5;
                    last_tag5 = last_tag4;
                    last_tag4 = last_tag3;
                    last_tag3 = last_tag2;
                    last_tag2 = last_tag;
                    last_tag = tag;

                    if ( delay_feedback > 0.9 ) delay_feedback = 0.9;
                    for ( var inst_n = 0; inst_n < inst.length; inst_n++) {
                        var this_inst = that.insts[inst[inst_n]];
                        this_inst.noteOn( freq1 * ( Math.floor( $elem.width() / 90 ) + 1), 1.0, 2000 );
                    }
                }

                // Get values from each instruments
                for ( var inst_name in that.insts ) {
                    v += that.insts[inst_name].get();
                }

                // FIXME: Cheepest filter
                var vv = v;
                v = ( vv + last_v ) / 2;
                last_v = vv;

                // FIXME: Cheepest delay
                v += ( delay_buffer[delay_idx] || 0.0 ) * delay_feedback;
                delay_buffer[delay_idx] = v;
                delay_idx = ( delay_idx + 1 ) % delay_len;

                // Output
                buffer[i] = v;
            }

            for ( var ch = 0; ch < that.channels; ch++) {
                var data = e.outputBuffer.getChannelData(ch);
                data.set( buffer );
            }
        };
    },
    play: function () {
        if ( this.playing ) return;
        this.playing = 1;
        this.node.connect( this.destination );
    },
    pause: function () {
        if ( !this.playing ) return;
        this.playing = 0;
        this.node.disconnect();
    }
};

var style_rules = [
    '* {color: #111 !important; background: #000 !important; }',
    'img, object, iframe, embed, input { opacity: 0.1 !important; }',
    '.soni-highlight-0 { background: #fff !important; }',
    '.soni-highlight-1 { background: #aaa !important; }',
    '.soni-highlight-2 { background: #777 !important; }',
    '.soni-highlight-3 { background: #444 !important; }',
    '.soni-highlight-4 { background: #222 !important; }',
    '.soni-highlight-5 { background: #000 !important; }',
    'img.soni-highlight-0, object.soni-highlight-0, iframe.soni-highlight-0, embed.soni-hightlight-0, input.soni-highlight-0 { opacity: 1.0 !important; }',
    'img.soni-highlight-1, object.soni-highlight-1, iframe.soni-highlight-1, embed.soni-hightlight-1, input.soni-highlight-1 { opacity: 0.8 !important; }',
    'img.soni-highlight-2, object.soni-highlight-2, iframe.soni-highlight-2, embed.soni-hightlight-2, input.soni-highlight-2 { opacity: 0.6 !important; }',
    'img.soni-highlight-3, object.soni-highlight-3, iframe.soni-highlight-3, embed.soni-hightlight-3, input.soni-highlight-3 { opacity: 0.4 !important; }',
    'img.soni-highlight-4, object.soni-highlight-4, iframe.soni-highlight-4, embed.soni-hightlight-4, input.soni-highlight-4 { opacity: 0.2 !important; }',
    'img.soni-highlight-5, object.soni-highlight-5, iframe.soni-highlight-5, embed.soni-hightlight-5, input.soni-highlight-5 { opacity: 0.1 !important; }',
];

function run ($) {

    var stylesheet;
    function installStylesheet () {
        stylesheet = stylesheet || $('<style type="text/css" id="soniStyle"></style>').appendTo($('head').eq(0)).get(0).sheet;
        for ( var rule_idx = 0; rule_idx < style_rules.length; rule_idx++ ) {
            var rule = style_rules[rule_idx];
            stylesheet.insertRule(rule);
        }
    }

    function uninstallStylesheet () {
        while ( stylesheet.cssRules.length ) {
            stylesheet.deleteRule(0);
        }
    }

    var elems = $('body').eq(0).find('*');
    var interval;
    var last = [[],[],[],[],[]];
    var elem_idx = 0;
    var last_idx = 0;

    // samples per tick
    var event_phase = 0;
    var current_scroll = 0;
    var highlight = function (mngr, length) {
        // At first, proccess the fade out buffer for smooth animate.
        if ( do_animation ) {
            var fadeout_gen = 5;
            for ( var offset = 0; offset < 5; offset++ ) {
                var idx = ( last_idx + offset ) % 5;
                for (var fo_id = 0; fo_id < last[idx].length; fo_id++) {
                    var el = last[idx][fo_id];
                    el.removeClass('soni-highlight-' + (Number(fadeout_gen) - 1));
                    el.addClass( 'soni-highlight-' + fadeout_gen );
                }
                fadeout_gen--;
            }
            last[last_idx] = [];
        }

        // Calucurate Samples Per Tick.
        var spt = (mngr.context.sampleRate * 60) / (bpm * 4);

        // Pick up how many events in this frame
        var events = [];
        var res = {};
        for ( ; event_phase < length ; event_phase += spt ) {
            events.push(event_phase);
        }
        event_phase -= length;
        for ( var ev = 0; ev < events.length; ev++ ) {
            var event_time = events[ev];
            var div = elems.eq(elem_idx);
            elem_idx = ( elem_idx + 1 ) % elems.length;
            if (   !( div.is(':visible') )
                || div.height() == 0
                || div.width()  == 0
                || div.css('visibility') == 'hidden' ) {
                continue;
            }

            if ( do_animation ) {
                div.addClass( 'soni-highlight-0' );
                last[last_idx].push(div);

                if ( $(div).offset().top > current_scroll + $(window).height() - 80 ) {
                    current_scroll = $(div).offset().top - $(window).height() * 0.3;
                }
                else if ( $(div).offset().top + $(div).height() < current_scroll + 80 ) {
                    current_scroll = $(div).offset().top - $(window).height() * 0.3;
                }
                $('html,body').scrollTop( current_scroll );

            }
            res[Math.floor(event_time)] = div;
        }
        last_idx = ( last_idx + 1 ) % 5;
        return res;
    };

    var manager = new SoundManager(highlight);
    // Controls
    $(window).keydown( function (e) {
        console.log( e.keyCode);
        if ( e.keyCode == 38 ) {
            bpm += 1;
            console.log('BPM: ' + bpm);
            return false;
        }
        else if ( e.keyCode == 40 ) {
            bpm -= 1;
            console.log('BPM: ' + bpm);
            return false;
        }
        else if ( e.keyCode == 37 ) {
            var back_count = e.shiftKey ? 64 : 8;
            elem_idx -= back_count;
            elem_idx = (elem_idx + elems.length) % elems.length;
            console.log('Rewinded ' + back_count + ' elements');
            return false;
        }
        else if ( e.keyCode == 39 ) {
            var forward_count = e.shiftKey ? 64 : 8;
            elem_idx += forward_count;
            elem_idx = (elem_idx + elems.length) % elems.length;
            console.log('Forwarded ' + forward_count + ' elements');
            return false;
        }
        else if ( e.keyCode == 32 ) {
            if ( manager.playing ) {
                manager.pause();
                uninstallStylesheet();
            }
            else {
                manager.play();
                installStylesheet();
            }
            console.log( manager.playing ? 'Playing' : 'Paused' );
            return false;
        }
        else if ( e.keyCode == 27 ) {
            // TBD: Destroy player and restore styles in DOM
            // return false;
        }
        else if ( e.keyCode == 65 ) {
            elem_idx = 0;
            console.log( "Rewinded to page top" );
            return false;
        }
        else if ( e.keyCode == 67 ) {
            do_change_key = !do_change_key;
            console.log( "Change key in H*: " + do_change_key );
            return false;
        }
        return true;
    });

    // Autoplay. Do you like?
    installStylesheet();
    manager.play();
}

if ( undefined === window.jQuery ) {
    console.log('Going to load jQuery');
    var sc = document.createElement('script');
    sc.setAttribute('src', "https://ajax.googleapis.com/ajax/libs/jquery/1.4.4/jquery.min.js");
    var body = document.getElementsByTagName('body').item(0);
    body.appendChild(sc);
    console.log('Finished Loading jQuery');
}
else {
    console.log('jQuery is ready');
}

var wait_for_jquery;
wait_for_jquery = setInterval( function () {
    if ( undefined !== window.jQuery ) {
        clearInterval(wait_for_jquery);
        run(jQuery);
    }
}, 200);

})();