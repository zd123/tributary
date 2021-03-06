//The Context is the essential part of tributary, it is what makes assumptions
//about the code and provides the context for the code to execute.

var reservedFiles = ["_.md", "config.json"];
Tributary.makeContext = function(options) {
  //Creates a context from a filename and/or file content
  //{
  //  config: REQUIRED
  //  model: optional, if a CodeModel is passed in, filename and content wont be used
  //  filename: optional, default: inlet.js
  //  content: optional, default: ""
  //  display: optional, default: "d3.select("#display")
  //}
  var context, model,display, type;
  var config = options.config;
  if(options.model) {
    model = options.model;
    filename = model.get("filename");
    type = model.get("type");
    if(reservedFiles.indexOf(filename) >= 0) return;
  } else {
    var filename, content;
    if(options.filename){
      filename = options.filename;
    } else {
      filename = "inlet.js";
    }
    if(options.content) {
      content = options.content;
    } else {
      content = "";
    }
    //figure out the context to make from the file extension
    var fn = filename.split(".");
    type = fn[fn.length-1];

    //make a code model with the content
    model = new tributary.CodeModel({name: fn[0], filename: filename, code: content});
  }
  if(options.display) {
    display = options.display;
  } else {
    display = d3.select("#display");
  }
  model.set("type", type);
  var ctxFn = tributary.__contextFns__;
  var context;
  if(ctxFn[type]) {
    context = ctxFn[type](config, model, display);
  } else {
    context = ctxFn['txt'](config, model, display);
  }
  return context;
}


//basic init function for all contexts
Tributary.init = init; //expose for plugins
function init(options) {
  this.model = options.model;
  this.el = options.el;
  this.config = options.config;
  //execute on code changes (if not silenced)
  if(!options.silent) {
    this.model.on("change:code", function() {
      tributary.__events__.trigger("execute");
    });
    tributary.__events__.on("post:execute", this.execute, this)
  }
  //if the user has modified the code, we want to protect them from losing their work
  this.model.on("change:code", function() {
    //TODO: use CodeMirror .isClean / .markClean when switch to v3
    tributary.__events__.trigger("warnchanged");
  }, this);
}

//The JS context evaluates js in the global namespace
tributary.JSContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    var js = this.model.get("code");
    js = this.model.handleParser(js)
    try {
      //eval(js);
      var initialize = new Function("g", "tributary", js);
      initialize(tributary.g, tributary)
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//Coffeescript Context
tributary.CoffeeContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      //TODO: use coffee compilation to give errors/warnings
      var code = this.model.get("code");
      js = CoffeeScript.compile(code, {"bare":true});
      //js = this.model.handleParser(js)
    } catch(err) {
      this.model.trigger("error", err);
      return false;
    }
    try {
      //eval(js);
      var initialize = new Function("g", "tributary", js);
      initialize(tributary.g, tributary)
    } catch (err) {
      this.model.trigger("error", err);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//processing context
tributary.ProcessingContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    var pde = this.model.get("code");
    var js = Processing.compile(pde).sourceCode;

    try {
      var fn = eval(js);
      if(tributary.__processing__) tributary.__processing__.exit();
      tributary.__processing__ = new Processing(tributary.canvas, fn);
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//JSON Context
//The JSON context evaluates json and sets the result to
//tributary.foo where foo is the name of the context
//i.e. the filename without the extension
tributary.JSONContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      var json = JSON.parse(this.model.get("code"));
      tributary[this.model.get("name")] = json;
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//The CSV context evaluates js in the global namespace
tributary.CSVContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      var json = d3.csv.parse(this.model.get("code"));
      tributary[this.model.get("name")] = json;
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//The TSV context evaluates js in the global namespace
tributary.TSVContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      var json = d3.tsv.parse(this.model.get("code"));
      tributary[this.model.get("name")] = json;
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//The CSS context adds a style element to the head with the contents of the css
tributary.CSSContext = function(options) {
  function ctx() {}
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      //set the text of the style element to the code
      this.el.textContent = this.model.get("code");
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }

  ctx.render = function() {
    //we create a style element for the model in the head
    this.el = d3.select("head")
      .selectAll("style.csscontext")
      .data([this.model], function(d) { return d.cid })
      .enter()
      .append("style")
      .classed("csscontext", true)
      .attr({
        type:"text/css"
      }).node();
  }
  init.call(ctx, options);
  ctx.model.on("delete", function() {
    d3.select(this.el).remove();
  }, ctx)
  return ctx;
}

tributary.HTMLContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      //set the text of the style element to the code
      $(this.el).append(this.model.get("code"));
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

tributary.SVGContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    try {
      var svg = d3.select(this.el).select("svg").node();
      if(!svg) {
        svg = d3.select(this.el).append("svg")
      }
      //TODO: validate the SVG?
      //this should happen before code from inlet gets executed
      tributary.appendSVGFragment(svg, this.model.get("code"));
    } catch (e) {
      this.model.trigger("error", e);
      return false;
    }
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

tributary.TextContext = function(options) {
  function ctx() {};
  ctx.execute = function() {
    if(tributary.__noupdate__) return;
    this.model.trigger("noerror");
    return true;
  }
  init.call(ctx, options);
  return ctx;
}

//These create a context based on file type.
tributary.__contextFns__ = {
  "json": function(config, model) {
    model.set("mode", "json")
    return tributary.JSONContext({
      config: config,
      model: model,
    });
  },
  "csv": function(config, model) {
    model.set("mode", "text")
    return tributary.CSVContext({
      config: config,
      model: model,
    });
  },
  "tsv": function(config, model) {
    model.set("mode", "text")
    return tributary.TSVContext({
      config: config,
      model: model,
    });
  },
  "js": function(config, model) {
    return tributary.JSContext({
      config: config,
      model: model,
    });
  },
  "coffee": function(config, model) {
    model.set("mode", "coffeescript")
    return tributary.CoffeeContext({
      config: config,
      model: model,
    });
  },
  "css": function(config, model) {
    model.set("mode", "css")
    return tributary.CSSContext({
      config: config,
      model: model,
    });
  },
  "pde": function(config, model) {
    model.set("mode", "javascript")
    tributary.__config__.set("display", "canvas");
    return tributary.ProcessingContext({
      config: config,
      model: model,
    });
  },
  "html": function(config, model, display) {
    model.set("mode", "text/html")
    return tributary.HTMLContext({
      config: config,
      model: model,
      el: display.node()
    });
  },
  "svg": function(config, model, display) {
    model.set("mode", "text/html")
    return tributary.SVGContext({
      config: config,
      model: model,
      el: display.node()
    });
  },
  "cpp": txt, "c": txt, "frag": txt, "geom": txt, "txt": txt
}
function txt(config, model, display) {
    model.set("mode", "text/x-csrc")
    return tributary.TextContext({
      config: config,
      model: model,
      el: display.node()
    });
  }

