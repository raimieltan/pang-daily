"""Build the modular Civic FD reference sedan. Blender --background --python this_file.

All authored coordinates: metres, X left, Y up, Z forward. No existing assets are
modified. Panel mounts and wheel origins are exported with the same contract as
the other cars. References: civic-fd/*.png; handling brief: civic-fd/fd.md.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/model/civic-fd'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
C = lambda p: Vector((p[0], -p[2], p[1]))
G = lambda p: (p[0], p[2], -p[1])

def material(name, color, metal=0, rough=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    return m

M = {
    'paint': material('paint', (.855, .855, .80), .2, .3),
    'trim': material('trim', (.014, .018, .022), 0, .62),
    'glass': material('glass', (.019, .038, .049), .38, .18),
    'chrome': material('chrome', (.65, .69, .72), .85, .22),
    'rim': material('rim', (.43, .46, .49), .72, .3),
    'rubber': material('rubber', (.018, .021, .024), 0, .85),
    'headlight': material('headlight', (.64, .72, .76), .35, .15),
    'taillight': material('taillight', (.48, .006, .016), .25, .24),
    'reverse': material('reverse', (.64, .65, .61), .25, .3),
    'amber': material('amber', (.9, .28, .015), .12, .3),
    'metal': material('metal', (.15, .18, .20), .65, .45),
    'interior': material('interior', (.035, .036, .036), 0, .85),
    'plate': material('plate', (.034, .05, .057), .05, .55),
}
root = bpy.data.objects.new('vehicle_root', None)
bpy.context.collection.objects.link(root)
root['vehicleId'] = 'hiraya_kidlat_fd_2007'
root['contract'] = 'kidlat-fd-v1'
root['drivetrain'] = 'FWD'

class Geometry:
    def __init__(self):
        self.vertices, self.faces, self.mats = [], [], []

    def face(self, pts, mat='paint'):
        n = len(self.vertices)
        self.vertices.extend(pts)
        self.faces.append(tuple(range(n, n + len(pts))))
        self.mats.append(mat)

    def solid(self, outline, offset, mat='paint'):
        back = [tuple(p[k] + offset[k] for k in range(3)) for p in outline]
        self.face(outline, mat)
        self.face(back[::-1], mat)
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            self.face([outline[i], back[i], back[j], outline[j]], mat)

    def box(self, center, size, mat='paint'):
        x, y, z = center
        w, h, d = [v / 2 for v in size]
        self.solid([(x-w,y-h,z-d),(x+w,y-h,z-d),(x+w,y+h,z-d),(x-w,y+h,z-d)], (0,0,2*d), mat)

    def sheet(self, fn, nu=16, nv=8, mat='paint', thickness=.008):
        rows = [[fn(i/nu, j/nv) for j in range(nv+1)] for i in range(nu+1)]
        for i in range(nu):
            for j in range(nv):
                q = [rows[i][j],rows[i+1][j],rows[i+1][j+1],rows[i][j+1]]
                self.face(q, mat)
                self.face([(x,y-thickness,z) for x,y,z in q[::-1]], mat)
        edge = rows[0] + [r[-1] for r in rows[1:]] + rows[-1][-2::-1] + [r[0] for r in rows[-2:0:-1]]
        for a,b in zip(edge,edge[1:]+edge[:1]):
            self.face([a,b,(b[0],b[1]-thickness,b[2]),(a[0],a[1]-thickness,a[2])],mat)

    def ring(self, center, profile, mat, segments=48):
        x,y,z = center
        for i in range(segments):
            a,b = 2*math.pi*i/segments,2*math.pi*(i+1)/segments
            for j in range(len(profile)):
                d,r = profile[j]; D,R = profile[(j+1)%len(profile)]
                self.face([(x+d,y+r*math.cos(a),z+r*math.sin(a)),
                           (x+d,y+r*math.cos(b),z+r*math.sin(b)),
                           (x+D,y+R*math.cos(b),z+R*math.sin(b)),
                           (x+D,y+R*math.cos(a),z+R*math.sin(a))],mat)

    def tube(self, points, radius=.006, mat='trim', sides=6):
        for a,b in zip(points,points[1:]):
            axis = (Vector(b)-Vector(a)).normalized()
            u = axis.cross(Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0))).normalized()
            v = axis.cross(u)
            rings = [[tuple(Vector(p)+radius*(u*math.cos(i*2*math.pi/sides)+v*math.sin(i*2*math.pi/sides))) for i in range(sides)] for p in [a,b]]
            self.face(rings[0][::-1],mat); self.face(rings[1],mat)
            for i in range(sides):
                j=(i+1)%sides
                self.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],mat)

    def write(self, name, origin=(0,0,0), parent=root, smooth=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([C(Vector(p)-Vector(origin)) for p in self.vertices], [], self.faces)
        names = list(dict.fromkeys(self.mats))
        for n in names: mesh.materials.append(M[n])
        for p,m in zip(mesh.polygons,self.mats): p.material_index=names.index(m)
        bm=bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(mesh); bm.free()
        if smooth:
            for p in mesh.polygons: p.use_smooth=True
        obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
        obj.parent=parent; obj.location=C(origin)
        return obj

def part(name, fn, origin=(0,0,0), smooth=False):
    g=Geometry(); fn(g); return g.write(name,origin,smooth=smooth)

def lerp(a,b,t): return a+(b-a)*t
def outline(g, pts, offset, mat='paint'): g.solid(pts, offset, mat)

# Smooth lower body with real wheel openings. Front wings are independent panels.
def width(z):
    return .8775 - .10*max(0,(abs(z)-1.55)/.72)**1.5
def belt(z):
    return .955 - .13*max(0,(z-.8)/1.47) + .025*max(0,(-z-.8)/1.47)
def bottom(z):
    y=.70 if z>1.73 or z < -1.69 else .245
    for axle in [1.37,-1.33]:
        d=abs(z-axle)
        if d<.351: y=max(y,.316+math.sqrt(.351**2-d*d))
    return y
def side_surface(g,s,z0,z1):
    def surface(u,v):
        z=lerp(z0,z1,u); lo=bottom(z); hi=belt(z)
        x=width(z)-.043*(1-v)+.011*math.sin(v*math.pi)
        return (s*x,lerp(lo,hi,v),z)
    g.sheet(surface,72,5,thickness=.006)
    # The upper shoulder meets the hood, window sill and trunk with a 2 mm seam.
    def shoulder(u,v):
        z=lerp(z0,z1,u)
        if z>.79:
            t=(z-.795)/(2.078-.795)
            inner=lerp(.815,.70,t)+.002; y=lerp(.958,.817,t)+.007
        elif z < -1.62:
            t=(-z-1.62)/.50
            inner=lerp(.76,.72,t)+.002; y=lerp(1.015,.965,t)
        else:
            inner=.823; y=belt(z)+.009
        return (s*lerp(width(z),inner,v),lerp(belt(z),y,v),z)
    g.sheet(shoulder,72,3,thickness=.008)

shell=Geometry()
for s in [-1,1]:
    side_surface(shell,s,-2.075,.79)
    # sill and cabin inner structure are revealed by removing skirts/fenders.
    shell.box((s*.78,.24,-.06),(.11,.08,1.93),'metal')
shell.box((0,.255,-.17),(1.48,.07,2.95),'metal')
shell.box((0,.74,.73),(1.5,.35,.045),'metal')
shell.write('shell_base',smooth=True)
for label,s in [('l',1),('r',-1)]:
    part('fender_f'+label+'_stock',lambda g,s=s:side_surface(g,s,.795,2.075),smooth=True)
    part('sideskirt_'+label+'_stock',lambda g,s=s:g.box((s*.853,.228,-.01),(.072,.095,1.97)))

# Broad hood with the FD's paired creases and short nose.
def hood(u,v):
    z=lerp(.795,2.078,v); x=(2*u-1)*lerp(.815,.70,v)
    y=lerp(.958,.817,v)+.025*(1-(2*u-1)**2)+.007*math.cos((2*u-1)*math.pi*2)
    return (x,y,z)
part('hood_stock',lambda g:g.sheet(hood,24,16),origin=(0,.965,.795),smooth=True)
part('trunk_stock',lambda g:g.sheet(lambda u,v:((2*u-1)*lerp(.76,.72,v),lerp(1.015,.965,v)+.018*(1-(2*u-1)**2),lerp(-1.62,-2.12,v)),20,8),origin=(0,1.015,-1.62),smooth=True)

# Long raked windshield and rounded single-arc roof; four side windows and broad C pillars.
part('roof_skin',lambda g:g.sheet(lambda u,v:((2*u-1)*lerp(.65,.64,v),1.44+.020*math.sin(math.pi*v)-.035*(2*u-1)**2,lerp(.02,-.91,v)),24,14),smooth=True)
part('windshield',lambda g:g.sheet(lambda u,v:((2*u-1)*lerp(.792,.65,v),lerp(.974,1.405,v)+.035*(1-(2*u-1)**2)*v,lerp(.789,.02,v)),24,12,'glass'),smooth=True)
part('rear_glass',lambda g:g.sheet(lambda u,v:((2*u-1)*lerp(.64,.759,v),lerp(1.405,1.024,v)+.035*(1-(2*u-1)**2)*(1-v),lerp(-.91,-1.62,v)),20,10,'glass'),smooth=True)
for label,s in [('l',1),('r',-1)]:
    cabin=Geometry()
    # A, B and C pillars join roof and belt without filling the window openings.
    A=[(s*.82,.956,.79),(s*.65,1.415,.02),(s*.62,1.443,-.08),(s*.777,.973,.63)]
    B=[(s*.821,.973,-.24),(s*.653,1.425,-.27),(s*.65,1.43,-.37),(s*.823,.975,-.34)]
    CP=[(s*.825,.987,-1.59),(s*.65,1.407,-.91),(s*.60,1.438,-.84),(s*.75,1.013,-1.68)]
    for pts in [A,B,CP]: cabin.solid(pts,(-s*.018,0,0))
    cabin.tube([(s*.82,.964,.77),(s*.83,.974,-.35),(s*.826,.99,-1.57)],.012)
    cabin.tube([(s*.651,1.413,.0),(s*.646,1.437,-.45),(s*.647,1.409,-.91)],.015,'paint')
    cabin.write('pillars_'+label)
    glass=Geometry()
    for pts in [
        [(s*.793,.985,.64),(s*.649,1.401,.012),(s*.658,1.416,-.255),(s*.816,.986,-.23)],
        [(s*.82,.986,-.36),(s*.655,1.416,-.385),(s*.65,1.393,-.89),(s*.812,.999,-1.48)],
    ]: glass.solid(pts,(-s*.008,0,0),'glass')
    glass.write('side_windows_'+label)
    seams=Geometry()
    for z in [.787,-.29,-.96]:
        lo=max(bottom(z)+.013,.29)
        seams.tube([(s*(width(z)+.003),lo,z),(s*(width(z)+.007),.65,z),(s*(width(z)+.002),belt(z)-.012,z)],.0025)
    for z in [.02,-.73]:
        seams.box((s*.884,.855,z),(.015,.024,.13),'paint')
        seams.box((s*.882,.844,z),(.012,.009,.12),'trim')
    seams.write('door_details_'+label)
    mirror=Geometry()
    mirror.box((s*.857,1.007,.53),(.075,.06,.09),'trim')
    mirror.solid([(s*.85,.994,.58),(s*.978,1.015,.59),(s*.991,1.087,.50),(s*.87,1.096,.48)],(0,0,-.11))
    mirror.solid([(s*.861,1.010,.466),(s*.978,1.025,.478),(s*.981,1.074,.397),(s*.872,1.079,.388)],(0,0,-.003),'chrome')
    mirror.write('mirror_'+label)

def bumper_front(g):
    # Curved wraparound bumper. Recesses are separate dark inset geometry, not painted holes.
    g.sheet(lambda u,v:((2*u-1)*lerp(.785,.835,v),lerp(.29,.70,v),2.265-.19*abs(2*u-1)**3-.10*v**4-.035*(1-v)**4),36,10)
    for s in [-1,1]:
        g.solid([(s*.78,.29,2.09),(s*.866,.33,1.755),(s*.868,.695,1.755),(s*.824,.704,2.095)],(-s*.012,0,0))
    g.solid([(-.46,.325,2.272),(.46,.325,2.272),(.395,.52,2.278),(-.395,.52,2.278)],(0,0,-.008),'trim')
    for x in [i*.055 for i in range(-7,8)]:
        g.box((x,.416,2.282),(.01,.14,.006),'metal')
    for s in [-1,1]:
        g.solid([(s*.50,.36,2.236),(s*.73,.36,2.174),(s*.74,.50,2.173),(s*.51,.49,2.236)],(0,0,-.009),'trim')
        pts=[(s*.625+.047*math.cos(i*math.pi/12),.425+.047*math.sin(i*math.pi/12),2.224) for i in range(24)]
        g.solid(pts,(0,0,-.009),'headlight')
    g.box((0,.606,2.259),(.335,.105,.022),'plate')
part('bumper_front_stock',bumper_front,smooth=True)
part('lip_front_stock',lambda g:g.sheet(lambda u,v:((2*u-1)*.797,lerp(.27,.295,v),lerp(2.18,2.275,v)-.16*abs(2*u-1)**3),28,2,'trim'))
part('chin_front_stock',lambda g:g.sheet(lambda u,v:((2*u-1)*.8,lerp(.254,.271,v),lerp(2.17,2.275,v)-.16*abs(2*u-1)**3),28,2))

def nose(g):
    g.solid([(-.386,.695,2.15),(.386,.695,2.15),(.46,.812,2.096),(-.46,.812,2.096)],(0,0,-.015),'trim')
    for y,z,w in [(.708,2.164,.35),(.793,2.119,.438)]:
        g.tube([(-w,y,z),(0,y-.013,z+.014),(w,y,z)],.012,'chrome')
    # Fictional marque badge, no real manufacturer emblem.
    g.solid([(-.035,.755,2.178),(0,.791,2.171),(.035,.755,2.178),(0,.720,2.184)],(0,0,-.012),'chrome')
part('grille_stock',nose)
for label,s in [('l',1),('r',-1)]:
    lamp=Geometry()
    pts=[(s*.43,.705,2.124),(s*.79,.699,2.006),(s*.835,.841,1.925),(s*.475,.812,2.101)]
    lamp.solid(pts,(0,-.01,-.018),'chrome')
    center=sum((Vector(p) for p in pts),Vector())/4
    inner=[tuple(center+(Vector(p)-center)*.89+Vector((0,0,.005))) for p in pts]
    lamp.solid(inner,(0,0,-.007),'headlight')
    for x,y,z,r in [(s*.554,.761,2.11,.047),(s*.693,.763,2.071,.051)]:
        circle=[(x+r*math.cos(i*math.pi/12),y+r*math.sin(i*math.pi/12),z) for i in range(24)]
        lamp.solid(circle,(0,0,-.006),'chrome')
        lamp.solid([(x+(a-x)*.70,y+(b-y)*.70,c+.003) for a,b,c in circle],(0,0,-.002),'headlight')
    lamp.write('headlight_'+label)

def rear_bumper(g):
    g.sheet(lambda u,v:((2*u-1)*lerp(.785,.84,v),lerp(.285,.72,v),-2.27+.10*(2*v-1)**2+.16*abs(2*u-1)**3),36,10)
    for s in [-1,1]:
        g.solid([(s*.78,.29,-2.12),(s*.867,.32,-1.72),(s*.868,.72,-1.72),(s*.83,.72,-2.11)],(-s*.01,0,0))
        g.box((s*.65,.39,-2.215),(.17,.025,.012),'taillight')
    g.box((0,.303,-2.225),(1.3,.06,.02),'trim')
part('bumper_rear_stock',rear_bumper,smooth=True)
part('rear_carrier',lambda g:g.sheet(lambda u,v:((2*u-1)*lerp(.84,.73,v),lerp(.718,.968,v),lerp(-2.17,-2.118,v)+.15*(1-v)*abs(2*u-1)**3),30,8),smooth=True)
part('rear_plate',lambda g:g.box((0,.814,-2.17),(.34,.135,.02),'plate'))
for label,s in [('l',1),('r',-1)]:
    lamp=Geometry()
    lamp.solid([(s*.355,.727,-2.167),(s*.77,.732,-2.13),(s*.725,.936,-2.146),(s*.40,.954,-2.16)],(0,0,.013),'taillight')
    lamp.solid([(s*.372,.735,-2.182),(s*.75,.741,-2.15),(s*.713,.777,-2.159),(s*.385,.773,-2.177)],(0,0,.005),'reverse')
    for x,y in [(s*.47,.844),(s*.641,.843)]:
        circle=[(x+.073*math.cos(i*math.pi/16),y+.073*math.sin(i*math.pi/16),-2.186+.06*(abs(x)-.47)) for i in range(32)]
        lamp.solid(circle,(0,0,.007),'trim')
        lamp.solid([(x+(a-x)*.89,y+(b-y)*.89,c-.003) for a,b,c in circle],(0,0,.003),'taillight')
        lamp.solid([(x+(a-x)*.45,y+(b-y)*.45,c-.005) for a,b,c in circle],(0,0,.003),'taillight')
    lamp.write('taillight_'+label)

def spoiler(g):
    for s in [-1,1]: g.box((s*.54,1.05,-1.945),(.055,.15,.12))
    g.sheet(lambda u,v:((2*u-1)*.728,1.124+.019*(2*u-1)**2+.012*math.sin(v*math.pi),lerp(-1.86,-2.07,v)),24,5)
    g.box((0,1.112,-2.075),(.30,.012,.008),'taillight')
part('spoiler_rear_stock',spoiler)

# Four separate wheel assemblies with true axle-centred pivots and open alloy spokes.
for wheel,s,z in [('fl',1,1.37),('fr',-1,1.37),('rl',1,-1.33),('rr',-1,-1.33)]:
    center=(s*.75,.316,z); g=Geometry()
    g.ring(center,[(-.1025,.226),(-.1025,.283),(-.083,.312),(-.07,.316),(.07,.316),(.083,.312),(.1025,.283),(.1025,.226)],'rubber')
    g.ring(center,[(-.1,.215),(-.1,.226),(.1,.226),(.1,.212)],'rim')
    g.ring(center,[(-.05,.045),(-.05,.168),(.05,.168),(.05,.045)],'metal')
    # Radial tread lines are shallow geometry in the same rubber primitive.
    for i in range(40):
        a=i*2*math.pi/40
        g.tube([(center[0]-.065,.316+.315*math.cos(a),z+.315*math.sin(a)),(center[0]+.065,.316+.315*math.cos(a+.016),z+.315*math.sin(a+.016))],.001,'trim',4)
    for i in range(5):
        a=i*2*math.pi/5
        def pt(r,angle): return (center[0]+s*.099,.316+r*math.cos(angle),z+r*math.sin(angle))
        g.solid([pt(.045,a-.30),pt(.212,a-.11),pt(.212,a+.12),pt(.045,a+.32)],(-s*.023,0,0),'rim')
    g.ring(center,[(s*.081,0),(s*.081,.05),(s*.105,.05),(s*.105,0)],'rim',32)
    # Symmetric extents keep pivots at the center of the tire, including the centre cap.
    g.write('wheel_'+wheel,center,smooth=True)

# Under-hood structure and transverse EFI engine remain when the hood is removed.
engine=Geometry()
engine.box((0,.54,1.26),(.66,.28,.43),'metal')
engine.box((-.035,.706,1.26),(.59,.065,.32),'trim')
for x in [-.22,-.08,.06,.20]: engine.box((x,.742,1.27),(.05,.02,.23),'chrome')
engine.box((-.51,.58,1.23),(.24,.24,.30),'metal')
engine.box((.50,.67,1.10),(.22,.15,.24),'trim')
engine.tube([(.46,.65,1.13),(.30,.71,1.03),(.16,.70,1.10)],.036,'trim',10)
engine.write('engine_stock')
part('engine_bay',lambda g:(g.box((0,.46,1.50),(1.34,.04,1.08),'trim'),g.box((0,.64,1.88),(1.25,.27,.045),'metal')))
exhaust=Geometry()
exhaust.tube([(0,.20,.80),(0,.19,-1.38),(.56,.20,-1.87),(.56,.23,-2.27)],.027,'metal',12)
for x in [.52,.60]: exhaust.tube([(x,.23,-2.15),(x,.23,-2.29)],.027,'chrome',16)
exhaust.write('exhaust_stock')
part('cabin_interior',lambda g:(g.box((0,.79,.55),(1.45,.15,.20),'interior'),g.box((0,.46,-.48),(1.34,.25,1.18),'interior')))

mounts={
    'hood': (0,.965,.795), 'bumper_front':(0,.52,2.10), 'bumper_rear':(0,.50,-2.12),
    'front_lip':(0,.28,2.21), 'chin':(0,.257,2.21), 'side_skirts':(0,.228,-.01),
    'spoiler':(0,1.0,-1.945), 'fender_fl':(.84,.68,1.38), 'fender_fr':(-.84,.68,1.38),
    'side_mirrors':(0,1.04,.50), 'roof':(0,1.46,-.4),
    'accessory_front':(0,.35,2.27),'accessory_rear':(0,.35,-2.27),'exhaust':(.56,.23,-2.20),
    'headlight_l':(.64,.77,2.06),'headlight_r':(-.64,.77,2.06),
    'taillight_l':(.56,.84,-2.17),'taillight_r':(-.56,.84,-2.17),
}
for name,pos in mounts.items():
    obj=bpy.data.objects.new('attach_'+name,None); bpy.context.collection.objects.link(obj)
    obj.parent=root; obj.location=C(pos); obj['slot']=name

bpy.context.view_layer.update()
vehicle=list(bpy.context.scene.objects)
bpy.ops.object.select_all(action='DESELECT')
for obj in vehicle: obj.select_set(True)
bpy.context.view_layer.objects.active=root
model=OUT/'civic_fd_2007_modular.glb'
bpy.ops.export_scene.gltf(filepath=str(model),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
(OUT/'mounting_interfaces.json').write_text(json.dumps({'vehicle':'hiraya_kidlat_fd_2007','contract':'kidlat-fd-v1','axes':{'up':'+Y','forward':'+Z','left':'+X'},'units':'metres','slots':mounts,'wheel_centers':{i:[s*.75,.316,z] for i,s,z in [('fl',1,1.37),('fr',-1,1.37),('rl',1,-1.33),('rr',-1,-1.33)]}},indent=2)+'\n')

if '--render' in sys.argv:
    # Render the exported artifact, not the working scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=20
    scene.render.threads_mode='FIXED'; scene.render.threads=4
    scene.render.resolution_x=1100; scene.render.resolution_y=720; scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Studio')
    scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.26,.30,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
    scene.view_settings.view_transform='AgX'
    bpy.ops.mesh.primitive_plane_add(size=200)
    ground=bpy.context.object; ground.name='studio_ground'; ground.location.z=-.012
    ground.data.materials.append(material('studio',(.15,.19,.21),0,.85))
    for p,power,size in [((3,6,4),1500,5),((-4,3,-2),1100,4),((1,5,-5),1700,4)]:
        light=bpy.data.lights.new('softbox','AREA'); light.energy=power; light.shape='DISK'; light.size=size
        obj=bpy.data.objects.new('softbox',light); scene.collection.objects.link(obj); obj.location=C(p)
        obj.rotation_euler=(C((0,.5,0))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.cameras.new('review'); cam=bpy.data.objects.new('review',camera); scene.collection.objects.link(cam); scene.camera=cam
    camera.type='ORTHO'; camera.ortho_scale=6.2
    folder=OUT/'previews'; folder.mkdir(exist_ok=True)
    shots=[('01_front_left',(4,2.4,5.6),[]),('02_rear_left',(4,2.4,-5.6),[]),('03_side',(6,1.1,0),[]),
           ('04_front',(0,1.15,6),[]),('05_rear',(0,1.2,-6),[]),
           ('06_hood_removed',(3.7,3.5,4.5),['hood_stock']),
           ('07_panels_removed',(4,2.8,5.5),['hood_stock','fender_fl_stock','bumper_front_stock','chin_front_stock','lip_front_stock']),
           ('08_rear_parts_removed',(4,2.8,-5.5),['bumper_rear_stock','spoiler_rear_stock','sideskirt_l_stock'])]
    for name,pos,hidden in shots:
        for obj in scene.objects:
            if obj.type=='MESH': obj.hide_render=obj.name in hidden
        cam.location=C(pos); cam.rotation_euler=(C((0,.70,0))-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(folder/(name+'.png')); bpy.ops.render.render(write_still=True)
    (OUT/'preview-validation.json').write_text(json.dumps({'source':model.name,'renderer':'Blender Cycles, exported GLB reimport','views':[{'view':n,'hidden':h} for n,p,h in shots]},indent=2)+'\n')
print('Civic FD exported:',model)
