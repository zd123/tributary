from flask import Flask, render_template
import urllib2
from urllib2 import URLError, HTTPError
import json

app = Flask(__name__)
app.debug = True

base_url = "/static/water/"

@app.route("/")
def hello():
    return "Hello World!"

@app.route("/tributary/")
def tributary():
    return render_template("water.html", base_url=base_url)


@app.route("/tributary/api/<gist>/<filename>")
def internal_gist(gist, filename):
    code = ""

    print gist, filename
    url = "https://raw.github.com/gist/" #1569370/boid.js
    url += gist + "/" + filename
    print "url", url

    req = urllib2.Request(url)
    try:
        obj = urllib2.urlopen(req)
        code = obj.read()
    except URLError, e:
        print "ERROR", e.code

    return code

@app.route("/tributary/<gist>/<filename>")
def gist(gist=None, filename=None):

    print gist, filename
    #return render_template("water.html", code=code, base_url=base_url) 
    return render_template("water.html", gist=gist, filename=filename, base_url=base_url) 


if __name__ == "__main__":
    app.run()
